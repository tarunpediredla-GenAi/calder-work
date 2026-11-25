from datetime import datetime, timezone
from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.agents.graph import build_delivery_graph
from app.config import settings
from app.models import Base, DeliveryRunRecord, ProjectRecord, PullRequestTable, WorkItemRecord
from app.services.github_client import GitHubClient, GitHubError

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

app = FastAPI(title="Calder Works API", version="1.0.0")
delivery_graph = build_delivery_graph()


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


@app.on_event("startup")
async def startup_create_tables() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


class ApprovalRequest(BaseModel):
    reviewer: str = Field(min_length=2, max_length=100)
    commit_sha: str = Field(min_length=7, max_length=64)


class MergeRequest(BaseModel):
    confirmed: bool
    confirmed_by: str = Field(min_length=2, max_length=100)
    commit_sha: str = Field(min_length=7, max_length=64)


@app.get("/api/health")
async def health() -> dict[str, object]:
    return {
        "service": "calder-works-api",
        "gemini_configured": bool(settings.gemini_api_key),
        "github_configured": bool(settings.github_token),
        "max_auto_corrections": settings.calder_max_auto_corrections,
    }


@app.get("/api/projects")
async def list_projects(session: AsyncSession = Depends(get_session)) -> list[dict[str, object]]:
    rows = (await session.execute(select(ProjectRecord).order_by(ProjectRecord.created_at.desc()))).scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "client_name": p.client_name,
            "repository": p.repository,
            "default_branch": p.default_branch,
            "stack_summary": p.stack_summary,
        }
        for p in rows
    ]


@app.post("/api/runs/{run_id}/approve-revision")
async def approve_revision(
    run_id: str,
    payload: ApprovalRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    run = await session.get(DeliveryRunRecord, run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")
    if payload.commit_sha != run.commit_sha:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Commit SHA mismatch: a newer commit exists and must be reviewed.",
        )

    pr = await session.scalar(select(PullRequestTable).where(PullRequestTable.run_id == run.id))
    if not pr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pull request not found.")

    latest_test = run.test_runs_json[-1] if run.test_runs_json else None
    if not latest_test or latest_test.get("exitCode") != 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot approve revision while required tests are failing.",
        )

    pr.approved_sha = run.commit_sha
    pr.approved_by = payload.reviewer
    pr.approved_at = datetime.now(timezone.utc)
    run.status = "approved"
    await session.commit()
    return {"run_id": run.id, "approved_sha": pr.approved_sha, "approved_by": pr.approved_by}


@app.post("/api/runs/{run_id}/merge")
async def merge_pull_request(
    run_id: str,
    payload: MergeRequest,
    session: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    if not payload.confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit merge confirmation is required.",
        )

    run = await session.get(DeliveryRunRecord, run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found.")

    pr = await session.scalar(select(PullRequestTable).where(PullRequestTable.run_id == run.id))
    work_item = await session.get(WorkItemRecord, run.work_item_id)
    project = await session.get(ProjectRecord, work_item.project_id) if work_item else None
    if not pr or not work_item or not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PR or project missing.")

    if pr.approved_sha != run.commit_sha or payload.commit_sha != run.commit_sha:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Merge blocked: current commit SHA does not match approved revision.",
        )

    github = GitHubClient()
    if github.configured:
        try:
            merge_res = await github.merge_pr_at_exact_sha(
                repo=project.repository,
                pr_number=pr.number,
                expected_head_sha=run.commit_sha,
                commit_title=f"{work_item.key}: {work_item.title}",
            )
            pr.merge_commit_sha = merge_res.get("sha")
        except GitHubError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    pr.status = "merged"
    pr.merged_by = payload.confirmed_by
    pr.merged_at = datetime.now(timezone.utc)
    run.status = "merged"
    work_item.status = "merged"
    await session.commit()
    return {"status": "merged", "merge_commit_sha": pr.merge_commit_sha}

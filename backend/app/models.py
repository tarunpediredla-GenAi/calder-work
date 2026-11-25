from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class ProjectRecord(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    client_name: Mapped[str] = mapped_column(String(120), nullable=False)
    repository: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    default_branch: Mapped[str] = mapped_column(String(64), nullable=False, default="main")
    stack_summary: Mapped[str] = mapped_column(String(140), nullable=False, default="FastAPI · React · PostgreSQL")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    work_items: Mapped[list["WorkItemRecord"]] = relationship(back_populates="project")


class WorkItemRecord(Base):
    __tablename__ = "work_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    key: Mapped[str] = mapped_column(String(24), nullable=False, unique=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    request_text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft_plan")
    assigned_reviewer: Mapped[str] = mapped_column(String(100), nullable=False)
    acceptance_criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    missing_info_flags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    plan_approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    project: Mapped["ProjectRecord"] = relationship(back_populates="work_items")
    runs: Mapped[list["DeliveryRunRecord"]] = relationship(back_populates="work_item")


class DeliveryRunRecord(Base):
    __tablename__ = "delivery_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    work_item_id: Mapped[str] = mapped_column(ForeignKey("work_items.id"), nullable=False, index=True)
    run_number: Mapped[int] = mapped_column(Integer, nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    commit_sha: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running")
    auto_correction_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_auto_correction_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    pause_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    steps_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    changed_files_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    test_runs_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    findings_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    work_item: Mapped["WorkItemRecord"] = relationship(back_populates="runs")
    pull_request: Mapped["PullRequestTable | None"] = relationship(
        back_populates="run", uselist=False
    )


class PullRequestTable(Base):
    __tablename__ = "pull_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("delivery_runs.id"), nullable=False, unique=True)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    branch_name: Mapped[str] = mapped_column(String(120), nullable=False)
    base_branch: Mapped[str] = mapped_column(String(64), nullable=False, default="main")
    url: Mapped[str] = mapped_column(String(256), nullable=False)
    is_draft: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    head_sha: Mapped[str] = mapped_column(String(64), nullable=False)
    # Approval is bound strictly to approved_sha. Any new commit clears approved_sha.
    approved_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="open")
    merge_commit_sha: Mapped[str | None] = mapped_column(String(64), nullable=True)
    merged_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    merged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    run: Mapped["DeliveryRunRecord"] = relationship(back_populates="pull_request")

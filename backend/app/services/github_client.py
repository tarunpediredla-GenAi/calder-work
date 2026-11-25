import base64
from typing import Any
import httpx

from app.config import settings


class GitHubError(RuntimeError):
    pass


class GitHubClient:
    """Server-side GitHub REST API client. Never exposed to the browser or test sandbox."""

    def __init__(self, token: str | None = None, api_base: str | None = None) -> None:
        self._token = (token or settings.github_token).strip()
        self._api_base = (api_base or settings.github_api_base).rstrip("/")

    @property
    def configured(self) -> bool:
        return bool(self._token)

    def _headers(self) -> dict[str, str]:
        if not self._token:
            raise GitHubError("GITHUB_TOKEN is not configured on the server.")
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "calder-works",
        }

    async def verify_connection(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{self._api_base}/user", headers=self._headers())
            if resp.status_code >= 400:
                raise GitHubError(f"GitHub auth check failed ({resp.status_code}): {resp.text}")
            return resp.json()

    async def read_repo_file(self, repo: str, path: str, ref: str = "main") -> str:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(
                f"{self._api_base}/repos/{repo}/contents/{path}",
                params={"ref": ref},
                headers=self._headers(),
            )
            if resp.status_code >= 400:
                raise GitHubError(f"Could not read {repo}/{path}: HTTP {resp.status_code}")
            payload = resp.json()
            encoded = payload.get("content", "")
            return base64.b64decode(encoded).decode("utf-8")

    async def create_feature_branch(
        self, repo: str, base_branch: str, feature_branch: str
    ) -> str:
        async with httpx.AsyncClient(timeout=20.0) as client:
            ref_resp = await client.get(
                f"{self._api_base}/repos/{repo}/git/ref/heads/{base_branch}",
                headers=self._headers(),
            )
            if ref_resp.status_code >= 400:
                raise GitHubError(
                    f"Failed reading base branch {base_branch}: HTTP {ref_resp.status_code}"
                )
            base_sha = ref_resp.json()["object"]["sha"]
            create_resp = await client.post(
                f"{self._api_base}/repos/{repo}/git/refs",
                headers=self._headers(),
                json={"ref": f"refs/heads/{feature_branch}", "sha": base_sha},
            )
            if create_resp.status_code not in (200, 201, 422):
                raise GitHubError(
                    f"Failed creating branch {feature_branch}: HTTP {create_resp.status_code}"
                )
            return base_sha

    async def commit_file(
        self, repo: str, branch: str, file_path: str, content: str, message: str
    ) -> str:
        encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
        async with httpx.AsyncClient(timeout=20.0) as client:
            existing_sha = None
            existing = await client.get(
                f"{self._api_base}/repos/{repo}/contents/{file_path}",
                params={"ref": branch},
                headers=self._headers(),
            )
            if existing.status_code == 200:
                existing_sha = existing.json().get("sha")
            body: dict[str, Any] = {
                "message": message,
                "content": encoded,
                "branch": branch,
            }
            if existing_sha:
                body["sha"] = existing_sha
            resp = await client.put(
                f"{self._api_base}/repos/{repo}/contents/{file_path}",
                headers=self._headers(),
                json=body,
            )
            if resp.status_code >= 400:
                raise GitHubError(
                    f"Failed committing {file_path}: HTTP {resp.status_code} {resp.text}"
                )
            return resp.json()["commit"]["sha"]

    async def open_draft_pr(
        self,
        repo: str,
        title: str,
        body: str,
        head_branch: str,
        base_branch: str = "main",
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{self._api_base}/repos/{repo}/pulls",
                headers=self._headers(),
                json={
                    "title": title,
                    "body": body,
                    "head": head_branch,
                    "base": base_branch,
                    "draft": True,
                },
            )
            if resp.status_code >= 400:
                raise GitHubError(
                    f"Failed opening draft PR: HTTP {resp.status_code} {resp.text}"
                )
            return resp.json()

    async def merge_pr_at_exact_sha(
        self, repo: str, pr_number: int, expected_head_sha: str, commit_title: str
    ) -> dict[str, Any]:
        """Merges PR only if GitHub confirms head SHA matches the exact approved commit SHA."""
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.put(
                f"{self._api_base}/repos/{repo}/pulls/{pr_number}/merge",
                headers=self._headers(),
                json={
                    "sha": expected_head_sha,
                    "commit_title": commit_title,
                    "merge_method": "squash",
                },
            )
            if resp.status_code >= 400:
                raise GitHubError(
                    f"Merge rejected by GitHub ({resp.status_code}): {resp.text}"
                )
            return resp.json()

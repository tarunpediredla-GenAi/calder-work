from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

from app.config import settings


@dataclass
class SandboxResult:
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: int
    command: str


def run_tests_in_isolated_sandbox(
    files_by_rel_path: dict[str, str],
    test_target: str = "tests",
) -> SandboxResult:
    """
    Writes generated code into a temporary workspace and runs pytest inside an isolated
    Docker container with:
      - --network=none (no outbound calls)
      - --read-only root filesystem
      - --cap-drop=ALL
      - --user 1000:1000 (non-root)
      - completely empty environment (zero access to GITHUB_TOKEN, GEMINI_API_KEY, DATABASE_URL)
    """
    os.makedirs(settings.workspace_root, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="calder-run-", dir=settings.workspace_root))
    start = time.monotonic()

    try:
        base_resolved = temp_dir.resolve()
        for rel_path, content in files_by_rel_path.items():
            target_path = (base_resolved / rel_path).resolve()
            if not str(target_path).startswith(str(base_resolved) + os.sep):
                raise ValueError(f"Unsafe relative path blocked: {rel_path}")
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_text(content, encoding="utf-8")

        cmd = [
            "docker",
            "run",
            "--rm",
            "--network=none",
            "--read-only",
            "--cap-drop=ALL",
            "--memory=512m",
            "--cpus=1",
            "--user",
            "1000:1000",
            "--tmpfs",
            "/tmp:rw,noexec,nosuid,size=64m",
            "-v",
            f"{base_resolved}:/workspace:ro",
            "-w",
            "/workspace",
            settings.calder_sandbox_image,
            test_target,
        ]

        # Pass minimal clean environment to subprocess so secrets never enter the child process.
        clean_env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin")}
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=settings.calder_sandbox_timeout_seconds,
            env=clean_env,
            check=False,
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        return SandboxResult(
            exit_code=proc.returncode,
            stdout=proc.stdout,
            stderr=proc.stderr,
            duration_ms=duration_ms,
            command=f"pytest -v --tb=short {test_target}",
        )
    except subprocess.TimeoutExpired as exc:
        duration_ms = int((time.monotonic() - start) * 1000)
        return SandboxResult(
            exit_code=124,
            stdout=exc.stdout or "",
            stderr=f"Sandbox test run timed out after {settings.calder_sandbox_timeout_seconds}s.",
            duration_ms=duration_ms,
            command=f"pytest -v --tb=short {test_target}",
        )
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

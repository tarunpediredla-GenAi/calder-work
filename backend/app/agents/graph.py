from __future__ import annotations

from typing import Annotated, Any, Literal, TypedDict
import operator

from google import genai
from langgraph.graph import END, START, StateGraph

from app.config import settings
from app.services.sandbox import run_tests_in_isolated_sandbox


class DeliveryGraphState(TypedDict, total=False):
    work_item_key: str
    repository: str
    request_text: str
    plan_approved: bool
    acceptance_criteria: list[str]
    missing_info: list[str]
    architecture_contract: str
    backend_files: dict[str, str]
    frontend_files: dict[str, str]
    test_files: dict[str, str]
    test_exit_code: int
    test_output: str
    correction_attempts: int
    max_correction_attempts: int
    correction_target: Literal["python_engineer", "react_engineer", "none"]
    correction_directive: str
    paused_for_human: bool
    review_findings: list[dict[str, Any]]
    documentation_summary: str
    step_log: Annotated[list[dict[str, Any]], operator.add]


def _call_gemini(system_instruction: str, prompt: str) -> str:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY must be configured on the server to run live agents.")
    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=prompt,
        config={"system_instruction": system_instruction},
    )
    return (response.text or "").strip()


def requirements_analyst_node(state: DeliveryGraphState) -> DeliveryGraphState:
    output = _call_gemini(
        "You are the Requirements Analyst agent. Produce concrete acceptance criteria and flag missing details.",
        f"Repository: {state['repository']}\nRequest: {state['request_text']}",
    )
    criteria = [line.strip("- ").strip() for line in output.splitlines() if line.strip()][:6]
    return {
        "acceptance_criteria": criteria,
        "step_log": [{"agent": "requirements_analyst", "status": "completed", "summary": f"{len(criteria)} criteria"}],
    }


def architect_node(state: DeliveryGraphState) -> DeliveryGraphState:
    contract = _call_gemini(
        "You are the Architect agent. Define the PostgreSQL schema, FastAPI contract, and file change plan.",
        f"Criteria:\n" + "\n".join(state.get("acceptance_criteria", [])),
    )
    return {
        "architecture_contract": contract,
        "step_log": [{"agent": "architect", "status": "completed", "summary": "API contract and data model ready"}],
    }


def python_engineer_node(state: DeliveryGraphState) -> DeliveryGraphState:
    directive = state.get("correction_directive", "")
    code = _call_gemini(
        "You are the Python Engineer agent. Implement FastAPI endpoints and SQLAlchemy models strictly against the contract.",
        f"Contract:\n{state.get('architecture_contract', '')}\nCorrection directive: {directive}",
    )
    return {
        "backend_files": {"backend/app/routers/generated.py": code},
        "step_log": [{"agent": "python_engineer", "status": "completed", "summary": "FastAPI backend updated"}],
    }


def react_engineer_node(state: DeliveryGraphState) -> DeliveryGraphState:
    directive = state.get("correction_directive", "")
    code = _call_gemini(
        "You are the React Engineer agent. Implement the React TypeScript UI against the shared API contract.",
        f"Contract:\n{state.get('architecture_contract', '')}\nCorrection directive: {directive}",
    )
    return {
        "frontend_files": {"frontend/src/pages/GeneratedFeature.tsx": code},
        "step_log": [{"agent": "react_engineer", "status": "completed", "summary": "React UI updated"}],
    }


def test_engineer_node(state: DeliveryGraphState) -> DeliveryGraphState:
    test_code = _call_gemini(
        "You are the Test Engineer agent. Write pytest tests for all acceptance criteria including duplicate roll number conflicts.",
        f"Criteria:\n{state.get('acceptance_criteria', [])}\nContract:\n{state.get('architecture_contract', '')}",
    )
    merged_workspace = {
        **state.get("backend_files", {}),
        **state.get("frontend_files", {}),
        "tests/test_feature.py": test_code,
    }
    sandbox_res = run_tests_in_isolated_sandbox(merged_workspace, test_target="tests")
    return {
        "test_files": {"tests/test_feature.py": test_code},
        "test_exit_code": sandbox_res.exit_code,
        "test_output": f"{sandbox_res.stdout}\n{sandbox_res.stderr}".strip(),
        "step_log": [
            {
                "agent": "test_engineer",
                "status": "completed" if sandbox_res.exit_code == 0 else "failed",
                "exit_code": sandbox_res.exit_code,
            }
        ],
    }


def bug_detection_agent_node(state: DeliveryGraphState) -> DeliveryGraphState:
    attempts = state.get("correction_attempts", 0) + 1
    max_attempts = state.get("max_correction_attempts", settings.calder_max_auto_corrections)
    if attempts > max_attempts:
        return {
            "paused_for_human": True,
            "correction_target": "none",
            "step_log": [
                {
                    "agent": "bug_detection_agent",
                    "status": "failed",
                    "summary": f"Paused after {max_attempts} automatic correction attempts.",
                }
            ],
        }

    directive = _call_gemini(
        "You are the Bug Detection agent. Inspect pytest failures and produce a focused correction request for the responsible engineer.",
        f"Exit code: {state.get('test_exit_code')}\nOutput:\n{state.get('test_output', '')}",
    )
    target: Literal["python_engineer", "react_engineer"] = (
        "react_engineer" if "frontend/" in directive.lower() else "python_engineer"
    )
    return {
        "correction_attempts": attempts,
        "correction_target": target,
        "correction_directive": directive,
        "paused_for_human": False,
        "step_log": [
            {
                "agent": "bug_detection_agent",
                "status": "completed",
                "summary": f"Auto-correction {attempts}/{max_attempts} routed to {target}",
            }
        ],
    }


def code_reviewer_node(state: DeliveryGraphState) -> DeliveryGraphState:
    review_text = _call_gemini(
        "You are the Code Reviewer agent. Check the combined diff against acceptance criteria and record file-specific findings.",
        f"Criteria:\n{state.get('acceptance_criteria', [])}\nBackend:\n{state.get('backend_files', {})}\nFrontend:\n{state.get('frontend_files', {})}",
    )
    return {
        "review_findings": [{"file": "combined_diff", "severity": "note", "message": review_text}],
        "step_log": [{"agent": "code_reviewer", "status": "completed", "summary": "Diff review recorded"}],
    }


def documentation_writer_node(state: DeliveryGraphState) -> DeliveryGraphState:
    docs = _call_gemini(
        "You are the Documentation Writer agent. Produce setup instructions and a concise change summary for the final revision.",
        f"Request: {state['request_text']}\nContract:\n{state.get('architecture_contract', '')}",
    )
    return {
        "documentation_summary": docs,
        "step_log": [{"agent": "documentation_writer", "status": "completed", "summary": "Release notes written"}],
    }


def _route_after_tests(state: DeliveryGraphState) -> str:
    if state.get("test_exit_code", 1) == 0:
        return "code_reviewer"
    return "bug_detection_agent"


def _route_after_bug_detection(state: DeliveryGraphState) -> str:
    if state.get("paused_for_human"):
        return END
    target = state.get("correction_target", "python_engineer")
    return target if target in ("python_engineer", "react_engineer") else "python_engineer"


def build_delivery_graph():
    """
    Coordinates all 8 Calder Works agents with LangGraph:
      1. requirements_analyst -> human plan approval gate
      2. architect -> fans out in parallel to python_engineer + react_engineer
      3. test_engineer -> runs isolated Docker pytest sandbox
      4. bug_detection_agent -> up to 2 automatic correction retries, then pauses for human decision
      5. code_reviewer -> documentation_writer -> END
    """
    graph = StateGraph(DeliveryGraphState)

    graph.add_node("requirements_analyst", requirements_analyst_node)
    graph.add_node("architect", architect_node)
    graph.add_node("python_engineer", python_engineer_node)
    graph.add_node("react_engineer", react_engineer_node)
    graph.add_node("test_engineer", test_engineer_node)
    graph.add_node("bug_detection_agent", bug_detection_agent_node)
    graph.add_node("code_reviewer", code_reviewer_node)
    graph.add_node("documentation_writer", documentation_writer_node)

    graph.add_edge(START, "requirements_analyst")
    graph.add_edge("requirements_analyst", "architect")

    # Parallel engineering tracks after architect produces shared contract
    graph.add_edge("architect", "python_engineer")
    graph.add_edge("architect", "react_engineer")

    # Converge both tracks into isolated test runner
    graph.add_edge(["python_engineer", "react_engineer"], "test_engineer")

    graph.add_conditional_edges(
        "test_engineer",
        _route_after_tests,
        {"code_reviewer": "code_reviewer", "bug_detection_agent": "bug_detection_agent"},
    )
    graph.add_conditional_edges(
        "bug_detection_agent",
        _route_after_bug_detection,
        {
            "python_engineer": "python_engineer",
            "react_engineer": "react_engineer",
            END: END,
        },
    )

    graph.add_edge("code_reviewer", "documentation_writer")
    graph.add_edge("documentation_writer", END)

    # Human plan approval gate occurs before architect runs in connected mode.
    return graph.compile(interrupt_before=["architect"])

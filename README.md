# Calder Works

**Calder Works** is a software delivery workspace built for engineering consultancies that maintain multiple client applications. Engineering managers and technical leads use a single workspace to submit feature requests, approve acceptance criteria before code generation, monitor an eight-agent LangGraph delivery pipeline, inspect diffs alongside isolated test runner output, approve exact commit SHAs, and merge verified pull requests.

---

## Table of Contents

1. [Product Screens](#product-screens)
2. [End-to-End Demo Journey](#end-to-end-demo-journey)
3. [Eight-Agent LangGraph Workflow](#eight-agent-langgraph-workflow)
4. [Architecture & Repository Layout](#architecture--repository-layout)
5. [Security & Governance Boundaries](#security--governance-boundaries)
6. [What Was Tested in the Preview](#what-was-tested-in-the-preview)
7. [What Runs Locally (Connected Mode)](#what-runs-locally-connected-mode)
8. [Integrations Requiring Credentials](#integrations-requiring-credentials)
9. [API Overview](#api-overview)
10. [Resetting Demo Workspace Data](#resetting-demo-workspace-data)

---

## Product Screens

| Screen | Purpose |
| --- | --- |
| **Projects** | Lists every client repository, open work items, and latest run status. Lets managers create a new client project or submit a new work item. |
| **Work item** | Displays the original feature request, editable acceptance criteria, clarification flags, assigned reviewer, and run history. Requires explicit plan approval before code generation begins. |
| **Run details** | Shows all eight LangGraph agents (`Requirements analyst` through `Documentation writer`) with live status, timing, auto-correction attempt counter, and clickable outputs (API contracts, changed files, pytest logs, review notes, release notes). |
| **Review** | Three-column engineering review layout: **Changed files** on the left, readable **unified diff** in the centre, and **test results & audit log** on the right. Supports **Request changes** (generating a new revision commit that invalidates prior approval) and **Approve revision** bound to the exact commit SHA. Keeps **Merge pull request** as a separate, gated two-step action. |
| **Connections** | Displays whether the workspace is running in **Demo workspace (simulated)** or **Connected mode**, GitHub authorization status, selected repository, server-side Gemini status, Docker sandbox availability, PostgreSQL connection status, and copyable local setup commands. |

---

## End-to-End Demo Journey

Calder Works opens immediately usable in **Demo workspace** mode with pre-populated consultancy repositories (`Campus Operations`, `Harbour Freight Portal`, and `Northfield Clinic API`) and durable server-side persistence (`data/calder-store.json`).

To run the flagship **Campus Operations** student register walkthrough:

1. On **Projects**, select **Campus Operations** (`calder-clients/campus-operations`) and click **New work item**.
2. Submit the request:
   > *"Give the college administrator a student register. Staff should be able to add a student using a roll number, name and department, search by roll number, and see a clear error if the roll number already exists."*
3. On **Work item**, review or edit the proposed acceptance criteria (or generate refined criteria via the server-side Gemini endpoint) and click **Approve plan & start run**.
4. On **Run details**, follow the eight-agent pipeline. Click any completed step—such as **Architect**, **Python engineer**, **React engineer**, **Test engineer**, or **Bug detection agent**—to inspect its actual contract, generated file diffs, test output (including the initial attempt-1 failure and automatic correction 1/2), or review notes.
5. Open **Review** to inspect backend (`backend/app/routers/students.py`, `backend/app/models/student.py`, `backend/tests/test_students.py`) and frontend (`frontend/src/pages/StudentRegisterPage.tsx`) diffs alongside the recorded pytest results—including `test_create_student_duplicate_roll_number_returns_409`.
6. Click **Request changes** with reviewer feedback (e.g., whitespace normalization on `roll_number`). Calder Works generates `rev-2` with a new commit SHA, updated diffs, and an additional passing test, automatically invalidating any prior approval.
7. Click **Approve revision** for the exact updated commit SHA.
8. Scroll to the separate **Pull request** footer, click **Merge pull request (Simulated)**, and confirm in the explicit merge dialog.
9. Refresh the browser page to verify that the work item, revision history, review audit trail, and merged PR status persist.

> **Paused-run example included:** Open **Harbour Freight Portal → CW-112** to inspect a run that exhausted both automatic correction attempts (`2 / 2`) and paused cleanly for a human decision with the exact pytest failure log visible.

---

## Eight-Agent LangGraph Workflow

The real backend pipeline in `backend/app/agents/graph.py` coordinates eight specialized agents inside a LangGraph `StateGraph`:

| Order | Agent | Deliverable |
| --- | --- | --- |
| 1 | **Requirements analyst** | Writes testable acceptance criteria and flags missing information or ambiguities before engineering starts. |
| — | *Human gate (`interrupt_before=["architect"]`)* | Engineering manager edits/approves the acceptance criteria before any code is generated. |
| 2 | **Architect** | Reads authorized repository files and defines the PostgreSQL data model, FastAPI contract, and file change plan. |
| 3a | **Python engineer** *(parallel)* | Implements FastAPI routes, Pydantic schemas, and SQLAlchemy models against the approved contract. |
| 3b | **React engineer** *(parallel)* | Implements the TypeScript/React interface against the exact same API contract in parallel with the Python engineer. |
| 4 | **Test engineer** | Writes automated pytest and UI test suites covering every acceptance criterion, including duplicate roll number conflicts (`409 Conflict`). |
| — | *Isolated test execution* | Runs the test suite inside the non-root, network-disabled Docker sandbox and records the exact exit code and stdout/stderr. |
| 5 | **Bug detection agent** | Inspects real test failures and dispatches a focused correction request to the responsible engineer. Allows up to **2 automatic correction attempts**, then pauses the run (`Paused — human decision`) if tests still fail. |
| 6 | **Code reviewer** | Audits the combined backend + frontend diff against acceptance criteria and records file- and line-scoped findings. |
| 7 | **Documentation writer** | Produces local setup instructions and a concise change summary matching the final verified revision. |

---

## Architecture & Repository Layout

```text
Browser (React 19 + TypeScript + Tailwind CSS v4)
   │
   ├── Preview / Demo Workspace ──▶ server.ts (Express + Vite on :3000)
   │                                  ├── src/server/store.ts        (atomic JSON persistence: data/calder-store.json)
   │                                  ├── src/server/demoEngine.ts   (8-agent simulation, diffs, pytest records)
   │                                  └── src/server/geminiService.ts(server-side @google/genai calls)
   │
   └── Local Connected Mode ──────▶ backend/app/main.py (FastAPI on :8000)
                                      ├── backend/app/agents/graph.py       (8-agent LangGraph StateGraph)
                                      ├── backend/app/models.py             (PostgreSQL + SQLAlchemy ORM)
                                      ├── backend/app/services/sandbox.py   (Docker --network=none runner)
                                      └── backend/app/services/github_client.py (Branches, commits, draft PRs, SHA merge)
```

### Key Files

```text
.
├── server.ts                         # Express preview server + Vite middleware + /api/* routes (port 3000)
├── docker-compose.yml                # PostgreSQL 16 + FastAPI backend + sandbox image build profile
├── .env.example                      # Documented server-side environment variables (no secrets committed)
├── src/
│   ├── App.tsx                       # Workspace shell, URL query state sync, and 5-screen router
│   ├── types/calder.ts               # Shared TypeScript domain contracts
│   ├── lib/
│   │   ├── api.ts                    # Typed client wrapper for /api/* routes
│   │   ├── workflow.ts               # Pure business logic: SHA approval validation, merge gating, diff parser
│   │   └── workflow.test.ts          # Node unit test suite for pure workflow and diff rules
│   ├── components/
│   │   ├── Sidebar.tsx               # Charcoal workspace navigation & Demo/Connected mode indicator
│   │   ├── TopBar.tsx                # Breadcrumb header, workspace mode notice, quick work-item action
│   │   ├── ProjectsView.tsx          # Screen 1: Client repositories, open work items, project creation
│   │   ├── WorkItemView.tsx          # Screen 2: Request intake, editable criteria, plan approval gate
│   │   ├── WorkItemModal.tsx         # New feature request submission dialog
│   │   ├── RunDetailsView.tsx        # Screen 3: 8-agent timeline, parallel tracks, clickable artifacts
│   │   ├── ReviewView.tsx            # Screen 4: Changed files, unified diff, tests, SHA-bound approval & merge
│   │   ├── ConnectionsView.tsx       # Screen 5: Mode status, repo selector, GitHub verify, local commands
│   │   └── StatusLabel.tsx           # Restrained status indicators and date formatters
│   └── server/
│       ├── demoEngine.ts             # Student-register diffs, pytest outputs, rev-2 revision generator
│       ├── seedData.ts               # Initial consultancy projects, saved run CW-108, paused run CW-112
│       ├── store.ts                  # Atomic write-to-temp-and-rename persistence (data/calder-store.json)
│       └── geminiService.ts          # Server-side @google/genai requirements drafting
└── backend/
    ├── Dockerfile                    # FastAPI production container
    ├── Dockerfile.sandbox            # Hardened non-root UID 1000 pytest sandbox image
    ├── requirements.txt              # FastAPI, LangGraph, SQLAlchemy, psycopg, httpx, google-genai
    └── app/
        ├── config.py                 # Pydantic server-only settings loader
        ├── models.py                 # PostgreSQL ORM schema (projects, work_items, runs, revisions, approvals)
        ├── main.py                   # FastAPI REST endpoints
        ├── agents/graph.py           # Eight-agent LangGraph workflow with human plan-approval interrupt
        └── services/
            ├── github_client.py      # Authorized GitHub REST client (branch, commit, draft PR, SHA merge)
            └── sandbox.py            # Isolated Docker test runner (--network=none, --read-only, stripped env)
```

---

## Security & Governance Boundaries

- **Server-only credentials:** `GEMINI_API_KEY`, `GITHUB_TOKEN`, and `DATABASE_URL` are read exclusively on the server and are never bundled into frontend JavaScript, sent to the browser, or exposed in API responses.
- **Credential-isolated test sandbox:** In local connected mode, `backend/app/services/sandbox.py` writes generated files into a temporary workspace (with path-traversal validation) and runs `pytest` inside `backend/Dockerfile.sandbox` using `--network=none`, `--read-only`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, `--user 1000:1000`, memory/CPU/PID limits, and stripped environment variables so generated code has zero access to host secrets or outbound networking.
- **SHA-bound reviewer approvals:** Approvals are recorded against the exact revision `commitSha`. Submitting a revision (`Request changes`) creates a new commit SHA and immediately invalidates prior approvals (`canMergePullRequest` enforces `approvedSha === currentHeadSha` and zero failing tests).
- **Separate merge confirmation:** Approving a revision never auto-merges code. Merging is a distinct, explicitly confirmed action that passes `expected_sha` to GitHub's merge API so a race-condition push cannot merge unreviewed code.

---

## What Was Tested in the Preview

Everything listed below was directly executed and verified in this environment:

1. **Pure workflow & diff unit tests (`npx tsx --test src/lib/workflow.test.ts`):**
   - Verified all 5 unit tests pass: SHA-bound approval invalidation on new commit SHAs, merge gating on failing tests and mismatched SHAs, 2-attempt automatic correction limit transitioning to `paused_human_decision`, unified diff parsing with line numbers, and work item input validation.
2. **Type-checking & production build (`npm run lint` and `npm run build`):**
   - Verified `tsc --noEmit` completes with 0 errors and the Vite production bundle compiles cleanly.
3. **End-to-end browser verification in headless Chromium (`http://localhost:3000`):**
   - Verified `0` browser console errors across all five screens.
   - Opened **Projects → Campus Operations** and submitted the exact student-register request (`CW-113`).
   - Reviewed acceptance criteria on **Work item** and clicked **Approve plan & start run**.
   - Inspected **Run details**: verified all 8 agents rendered cleanly without truncation (including parallel **Python engineer** and **React engineer** tracks) and clicked completed agent steps (such as **Architect**) to inspect actual outputs.
   - Inspected **Review**: verified backend (`routers/students.py`, `models/student.py`, `tests/test_students.py`) and frontend (`StudentRegisterPage.tsx`) changed files, readable unified diffs, and the duplicate-roll-number test (`test_create_student_duplicate_roll_number_returns_409`).
   - Submitted **Request changes** on `rev-1` (`19f0c1a`), verified generation of `rev-2` (`72addaf`) with updated normalization diffs and 6 passing tests, and verified that approval was required again for `72addaf`.
   - Approved exact revision `72addaf`, then clicked **Merge pull request (Simulated)** and confirmed in the separate merge confirmation step (`Pull request #185 — Merged`).
   - Reloaded the page and restarted the preview server to confirm `CW-113`, its revision history, approval audit trail, and merged status persisted from `data/calder-store.json`.
   - Verified the **Connections** screen displays Demo workspace status, server-side Gemini availability, selected repository controls, and local setup commands.

### Not Executed Live in the Preview Container

The hosted preview runtime runs Node.js/Express + Vite and does not expose a Docker daemon, Python/FastAPI runtime, PostgreSQL server, or live GitHub credentials. Consequently, the Python FastAPI backend (`backend/`), Docker sandbox (`backend/Dockerfile.sandbox`), PostgreSQL schema (`docker-compose.yml`), and live GitHub branch/PR writes are included as complete source code for local connected execution and are **simulated** in the preview's **Demo workspace** mode.

---

## What Runs Locally (Connected Mode)

### Prerequisites

- **Node.js 20+** and **npm**
- **Docker** and **Docker Compose v2** (for PostgreSQL, FastAPI/LangGraph, and the isolated non-root test sandbox)
- Valid server-side `GEMINI_API_KEY` and `GITHUB_TOKEN` (see [Integrations Requiring Credentials](#integrations-requiring-credentials))

### Option A: Run Preview / Demo Workspace Locally

```bash
npm install
npx tsx --test src/lib/workflow.test.ts
npm run lint
npm run build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Workspace state persists to `data/calder-store.json`.

### Option B: Run Full Connected Mode (FastAPI + LangGraph + PostgreSQL + Docker Sandbox)

```bash
# 1. Create your local environment file (never commit .env)
cp .env.example .env
# Edit .env and set GEMINI_API_KEY, GITHUB_TOKEN, and PostgreSQL credentials

# 2. Build the isolated non-root pytest sandbox image (--network=none)
docker compose --profile build-only build sandbox-image

# 3. Start PostgreSQL 16 and the FastAPI + LangGraph backend on port 8000
docker compose up --build

# 4. In a second terminal, verify the FastAPI backend health endpoint
curl http://localhost:8000/api/health

# 5. Start the Calder Works web workspace pointed at the local FastAPI backend
npm install
CALDER_WORKSPACE_MODE=connected CALDER_BACKEND_URL=http://localhost:8000 npm run dev
```

Open [http://localhost:3000](http://localhost:3000), go to **Connections**, select your authorized repository, and click **Verify GitHub connection**.

---

## Integrations Requiring Credentials

All credentials are configured strictly via server-side environment variables in `.env` (copied from `.env.example`).

| Environment Variable | Required In Demo Preview? | Required In Local Connected Mode? | Purpose & Required Permissions |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | Optional (enables live server-side requirements drafting; Demo workspace works without it) | **Required** | Server-side Gemini API key used by LangGraph agents and requirements drafting (`@google/genai` / `google-genai`). Never exposed to the browser. |
| `GITHUB_TOKEN` | Not required (PR actions are simulated) | **Required** | GitHub fine-grained Personal Access Token (or GitHub App installation token) with **Contents: Read & Write** and **Pull requests: Read & Write** on authorized client repositories. Used to read repo files, create feature branches, commit changes, open draft PRs, and merge verified SHAs. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` | Not required (uses `data/calder-store.json`) | **Required** (defaults provided in `docker-compose.yml` for local dev) | PostgreSQL connection settings for SQLAlchemy persistence of projects, work items, LangGraph runs, revisions, and SHA-bound approvals. |
| `CALDER_SANDBOX_IMAGE` | Not required | Optional (defaults to `calder-works-sandbox:latest`) | Docker image tag built from `backend/Dockerfile.sandbox` for isolated pytest execution. |
| `CALDER_WORKSPACE_MODE` | Defaults to `demo` | Set to `connected` | Switches UI and server status between `demo` (simulated runs/PRs) and `connected` (live FastAPI/GitHub/Docker execution). |
| `CALDER_BACKEND_URL` | Not required | Defaults to `http://localhost:8000` | Base URL of the local FastAPI backend when running in connected mode. |

---

## API Overview

### Preview Server (`server.ts` on `:3000`)

| Method & Path | Description |
| --- | --- |
| `GET /api/workspace` | Returns projects, work items, runs, and connection status from persistent store. |
| `POST /api/projects` | Creates a new client project entry. |
| `POST /api/work-items` | Submits a feature request and generates initial requirements analysis. |
| `POST /api/work-items/:id/draft-criteria` | Uses server-side Gemini (`GEMINI_API_KEY`) to draft/refine acceptance criteria. |
| `PATCH /api/work-items/:id/criteria` | Saves edited acceptance criteria and assigned reviewer before approval. |
| `POST /api/work-items/:id/approve-plan` | Approves the plan and executes the eight-agent workflow run. |
| `POST /api/runs/:runId/request-changes` | Records reviewer feedback, generates a new revision commit SHA, and invalidates prior approval. |
| `POST /api/runs/:runId/approve` | Records reviewer approval bound strictly to the current revision's `commitSha`. |
| `POST /api/runs/:runId/merge` | Validates passing tests + exact SHA match and merges the pull request. |
| `POST /api/runs/:runId/resume` | Resumes or stops a run paused after exhausting both automatic correction attempts. |
| `PATCH /api/connections` | Updates the active repository selection. |
| `POST /api/connections/verify-github` | Verifies server-side `GITHUB_TOKEN` against GitHub's `/user` API without exposing the token. |
| `POST /api/workspace/reset` | Restores initial seeded demo data. |

### FastAPI Connected Backend (`backend/app/main.py` on `:8000`)

Mirrors the workspace lifecycle backed by PostgreSQL (`models.py`), LangGraph (`agents/graph.py`), isolated Docker test runs (`services/sandbox.py`), and GitHub REST integration (`services/github_client.py`), including `GET /api/health`.

---

## Resetting Demo Workspace Data

To restore the preview workspace to its clean initial seed state (including saved example `CW-108`, merged `CW-104`, and paused run `CW-112`), open **Connections** in the app and click **Reset demo workspace data**, or delete `data/calder-store.json` and restart `npm run dev`.

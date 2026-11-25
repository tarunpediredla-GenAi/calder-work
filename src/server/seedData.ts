import {
  buildDeterministicSha,
  MAX_AUTO_CORRECTION_ATTEMPTS,
} from '../lib/workflow';
import type {
  DeliveryRun,
  Project,
  WorkItem,
  WorkspaceSnapshot,
} from '../types/calder';

export function createInitialSeedWorkspace(): WorkspaceSnapshot {
  const projects: Project[] = [
    {
      id: 'proj-campus-ops',
      name: 'Campus Operations',
      clientName: 'St. Jude College',
      repository: 'calder-clients/campus-operations',
      defaultBranch: 'main',
      stackSummary: 'FastAPI · React · PostgreSQL',
      description:
        'Administrative portal for student records, academic timetables, and seminar room allocations.',
      createdAt: '2026-10-12T09:00:00Z',
    },
    {
      id: 'proj-harbour-freight',
      name: 'Harbour Freight Portal',
      clientName: 'Northsea Logistics',
      repository: 'calder-clients/harbour-freight-portal',
      defaultBranch: 'main',
      stackSummary: 'FastAPI · React · PostgreSQL',
      description:
        'Customs manifest preparation, container clearance tracking, and carrier billing.',
      createdAt: '2026-09-28T11:30:00Z',
    },
    {
      id: 'proj-northfield-clinic',
      name: 'Northfield Clinic API',
      clientName: 'Northfield Health Group',
      repository: 'calder-clients/northfield-clinic-api',
      defaultBranch: 'main',
      stackSummary: 'FastAPI · TypeScript · PostgreSQL',
      description:
        'Patient scheduling service and appointment reminder notification pipeline.',
      createdAt: '2026-08-19T14:15:00Z',
    },
  ];

  const sha108 = buildDeterministicSha('calder-clients/campus-operations:CW-108:rev-1');
  const sha104 = buildDeterministicSha('calder-clients/campus-operations:CW-104:rev-1');
  const merge104 = buildDeterministicSha('calder-clients/campus-operations:CW-104:merge');
  const sha112 = buildDeterministicSha('calder-clients/harbour-freight-portal:CW-112:rev-1');
  const sha101 = buildDeterministicSha('calder-clients/northfield-clinic-api:CW-101:rev-1');
  const merge101 = buildDeterministicSha('calder-clients/northfield-clinic-api:CW-101:merge');

  const workItems: WorkItem[] = [
    {
      id: 'wi-108',
      key: 'CW-108',
      projectId: 'proj-campus-ops',
      title: 'Faculty timetable CSV export with term filter',
      requestText:
        'Allow academic coordinators to export the faculty timetable for a chosen term as a UTF-8 CSV file with course code, instructor name, room, and weekly time slot.',
      status: 'needs_review',
      assignedReviewer: 'Priya Nair',
      createdBy: 'Hannah Reid',
      createdAt: '2026-11-24T10:15:00Z',
      updatedAt: '2026-11-24T10:42:00Z',
      planApprovedAt: '2026-11-24T10:21:00Z',
      acceptanceCriteria: [
        {
          id: 'ac-108-1',
          text: 'GET /api/timetables/export?term=2026-FALL returns text/csv with Content-Disposition attachment header.',
          category: 'functional',
          verified: true,
        },
        {
          id: 'ac-108-2',
          text: 'Cells starting with =, +, -, or @ are sanitized to prevent spreadsheet formula injection.',
          category: 'validation',
          verified: true,
        },
        {
          id: 'ac-108-3',
          text: 'Timetable toolbar includes a single-click Export CSV button disabled when no term is selected.',
          category: 'ui',
          verified: true,
        },
      ],
      missingInfoFlags: [],
      runIds: ['run-wi-108-1'],
      latestRunId: 'run-wi-108-1',
    },
    {
      id: 'wi-104',
      key: 'CW-104',
      projectId: 'proj-campus-ops',
      title: 'Seminar room booking overlap conflict check',
      requestText:
        'Prevent double-booking seminar halls when two reservation intervals overlap on the same date and return the conflicting reservation ID.',
      status: 'merged',
      assignedReviewer: 'Martin Novak',
      createdBy: 'Hannah Reid',
      createdAt: '2026-11-20T14:00:00Z',
      updatedAt: '2026-11-20T16:10:00Z',
      planApprovedAt: '2026-11-20T14:12:00Z',
      acceptanceCriteria: [
        {
          id: 'ac-104-1',
          text: 'Overlapping room reservations return HTTP 409 Conflict with conflicting_booking_id.',
          category: 'validation',
          verified: true,
        },
      ],
      missingInfoFlags: [],
      runIds: ['run-wi-104-1'],
      latestRunId: 'run-wi-104-1',
    },
    {
      id: 'wi-112',
      key: 'CW-112',
      projectId: 'proj-harbour-freight',
      title: 'Customs manifest HS tariff checksum validation',
      requestText:
        'Validate 8-digit Harmonized System tariff codes against the updated 2026 customs schedule before allowing manifest submission.',
      status: 'paused_human_decision',
      assignedReviewer: 'Owen Fraser',
      createdBy: 'Claire Bennett',
      createdAt: '2026-11-24T15:05:00Z',
      updatedAt: '2026-11-24T15:24:00Z',
      planApprovedAt: '2026-11-24T15:10:00Z',
      acceptanceCriteria: [
        {
          id: 'ac-112-1',
          text: 'Reject unknown HS codes with HTTP 422 and line-item index.',
          category: 'validation',
          verified: false,
        },
        {
          id: 'ac-112-2',
          text: 'Preserve backward compatibility with legacy 6-digit draft manifests.',
          category: 'functional',
          verified: false,
        },
      ],
      missingInfoFlags: [
        {
          id: 'flag-112-1',
          question:
            'Legacy fixture manifests/draft_2025.json contains 6-digit provisional codes that fail the strict 8-digit tariff lookup.',
          severity: 'blocking',
        },
      ],
      runIds: ['run-wi-112-1'],
      latestRunId: 'run-wi-112-1',
    },
    {
      id: 'wi-101',
      key: 'CW-101',
      projectId: 'proj-northfield-clinic',
      title: 'SMS appointment reminder opt-out endpoint',
      requestText:
        'Add a patient preference endpoint and clinic toggle so reception staff can record SMS reminder opt-outs with audit timestamps.',
      status: 'merged',
      assignedReviewer: 'Priya Nair',
      createdBy: 'David Okafor',
      createdAt: '2026-11-18T09:30:00Z',
      updatedAt: '2026-11-18T11:45:00Z',
      planApprovedAt: '2026-11-18T09:45:00Z',
      acceptanceCriteria: [
        {
          id: 'ac-101-1',
          text: 'PATCH /api/patients/{id}/notifications persists sms_opt_out and opt_out_recorded_at.',
          category: 'functional',
          verified: true,
        },
      ],
      missingInfoFlags: [],
      runIds: ['run-wi-101-1'],
      latestRunId: 'run-wi-101-1',
    },
  ];

  const runs: DeliveryRun[] = [
    {
      id: 'run-wi-108-1',
      workItemId: 'wi-108',
      runNumber: 1,
      revisionNumber: 1,
      commitSha: sha108,
      status: 'needs_review',
      simulated: true,
      createdAt: '2026-11-24T10:21:00Z',
      updatedAt: '2026-11-24T10:42:00Z',
      autoCorrectionAttempts: 0,
      maxAutoCorrectionAttempts: MAX_AUTO_CORRECTION_ATTEMPTS,
      steps: [
        {
          id: 's108-1',
          role: 'requirements_analyst',
          label: 'Requirements analyst',
          stageOrder: 1,
          status: 'completed',
          durationMs: 790,
          inputsSummary: 'Work item CW-108 request',
          outputsSummary: '3 acceptance criteria locked',
          artifact: {
            kind: 'requirements',
            title: 'CW-108 Acceptance Criteria',
            summary: 'CSV export endpoint, formula sanitization, and UI button contract.',
            content:
              '1. GET /api/timetables/export?term=2026-FALL returns UTF-8 CSV attachment.\n2. Prefix formula characters (=, +, -, @) with a single quote.\n3. Disable export button when no term is selected.',
          },
        },
        {
          id: 's108-2',
          role: 'architect',
          label: 'Architect',
          stageOrder: 2,
          status: 'completed',
          durationMs: 1320,
          inputsSummary: 'calder-clients/campus-operations@main',
          outputsSummary: 'StreamingResponse CSV route + toolbar download helper',
          artifact: {
            kind: 'architecture',
            title: 'Timetable CSV Export Contract',
            summary: 'Single GET streaming route reading existing TimetableEntry table.',
            content:
              'GET /api/timetables/export?term=<string>\nHeaders: Content-Type: text/csv; charset=utf-8\nColumns: course_code,instructor_name,room_name,day_of_week,start_time',
          },
        },
        {
          id: 's108-3',
          role: 'python_engineer',
          label: 'Python engineer',
          stageOrder: 3,
          parallelGroup: 'implementation',
          status: 'completed',
          durationMs: 1850,
          inputsSummary: 'Timetable CSV export contract (parallel branch A)',
          outputsSummary: 'Updated backend/app/routers/timetables.py (+34/-2)',
          artifact: {
            kind: 'code_changes',
            title: 'FastAPI CSV Streaming Route',
            summary: 'Added sanitized CSV generator with formula-injection guard.',
            content:
              'Added sanitize_csv_cell() and GET /api/timetables/export streaming route.',
          },
        },
        {
          id: 's108-4',
          role: 'react_engineer',
          label: 'React engineer',
          stageOrder: 3,
          parallelGroup: 'implementation',
          status: 'completed',
          durationMs: 1640,
          inputsSummary: 'Timetable CSV export contract (parallel branch B)',
          outputsSummary: 'Updated frontend/src/pages/TimetablePage.tsx (+19/-1)',
          artifact: {
            kind: 'code_changes',
            title: 'Timetable Export Toolbar Button',
            summary: 'Connected term filter state to /api/timetables/export download.',
            content:
              'Added Export CSV button in TimetablePage toolbar with disabled state.',
          },
        },
        {
          id: 's108-5',
          role: 'test_engineer',
          label: 'Test engineer',
          stageOrder: 4,
          status: 'completed',
          durationMs: 980,
          inputsSummary: 'Isolated sandbox pytest run',
          outputsSummary: 'Exit code 0 · 4 passed, 0 failed',
          artifact: {
            kind: 'test_report',
            title: 'Timetable Export Pytest Report',
            summary: 'All 4 tests passed in isolated sandbox.',
            content:
              'test_export_csv_headers PASSED\ntest_export_csv_filters_term PASSED\ntest_export_csv_sanitizes_formula_prefix PASSED\ntest_export_missing_term_422 PASSED\n4 passed in 0.98s (exit code 0)',
          },
        },
        {
          id: 's108-6',
          role: 'bug_detection_agent',
          label: 'Bug detection agent',
          stageOrder: 5,
          status: 'skipped',
          durationMs: 0,
          inputsSummary: 'Exit code 0 from test runner',
          outputsSummary: 'Skipped — no failing tests',
        },
        {
          id: 's108-7',
          role: 'code_reviewer',
          label: 'Code reviewer',
          stageOrder: 6,
          status: 'completed',
          durationMs: 1090,
          inputsSummary: '3 changed files',
          outputsSummary: '1 non-blocking suggestion recorded',
          artifact: {
            kind: 'code_review',
            title: 'CW-108 Code Review',
            summary: 'Formula sanitization verified; minor header filename note.',
            content:
              '[SUGGESTION] backend/app/routers/timetables.py:24\nInclude sanitized term slug in filename header (timetable-2026-FALL.csv).',
          },
        },
        {
          id: 's108-8',
          role: 'documentation_writer',
          label: 'Documentation writer',
          stageOrder: 7,
          status: 'completed',
          durationMs: 620,
          inputsSummary: 'Revision summary + PR description',
          outputsSummary: 'Updated docs/timetables.md',
          artifact: {
            kind: 'documentation',
            title: 'CW-108 Release Summary',
            summary: 'Added CSV export usage note for academic coordinators.',
            content:
              'Academic coordinators can export term timetables via GET /api/timetables/export?term=<term>.',
          },
        },
      ],
      changedFiles: [
        {
          path: 'backend/app/routers/timetables.py',
          layer: 'backend',
          changeType: 'modified',
          additions: 34,
          deletions: 2,
          language: 'python',
          diff: `diff --git a/backend/app/routers/timetables.py b/backend/app/routers/timetables.py
index 2b149a0..8d4e312 100644
--- a/backend/app/routers/timetables.py
+++ b/backend/app/routers/timetables.py
@@ -1,5 +1,7 @@
+import csv
+import io
 from fastapi import APIRouter, Depends, Query
-from sqlalchemy import select
+from fastapi.responses import StreamingResponse
+from sqlalchemy import select
 from sqlalchemy.ext.asyncio import AsyncSession
 
 from app.db import get_session
@@ -8,3 +10,33 @@
 router = APIRouter(prefix="/api/timetables", tags=["timetables"])
+
+
+def sanitize_csv_cell(value: str) -> str:
+    if value and value[0] in ("=", "+", "-", "@"):
+        return f"'{value}"
+    return value
+
+
+@router.get("/export")
+async def export_timetable_csv(
+    term: str = Query(..., min_length=4, max_length=24),
+    session: AsyncSession = Depends(get_session),
+) -> StreamingResponse:
+    rows = (
+        await session.execute(
+            select(TimetableEntry).where(TimetableEntry.term == term).order_by(TimetableEntry.course_code)
+        )
+    ).scalars().all()
+    buffer = io.StringIO()
+    writer = csv.writer(buffer)
+    writer.writerow(["course_code", "instructor_name", "room_name", "day_of_week", "start_time"])
+    for row in rows:
+        writer.writerow([sanitize_csv_cell(str(v)) for v in (row.course_code, row.instructor_name, row.room_name, row.day_of_week, row.start_time)])
+    buffer.seek(0)
+    return StreamingResponse(
+        iter([buffer.getvalue()]),
+        media_type="text/csv; charset=utf-8",
+        headers={"Content-Disposition": f'attachment; filename="timetable-{term}.csv"'},
+    )`,
        },
        {
          path: 'frontend/src/pages/TimetablePage.tsx',
          layer: 'frontend',
          changeType: 'modified',
          additions: 19,
          deletions: 1,
          language: 'typescript',
          diff: `diff --git a/frontend/src/pages/TimetablePage.tsx b/frontend/src/pages/TimetablePage.tsx
index 44c910a..9f3d21b 100644
--- a/frontend/src/pages/TimetablePage.tsx
+++ b/frontend/src/pages/TimetablePage.tsx
@@ -18,7 +18,25 @@ export function TimetablePage() {
   const [selectedTerm, setSelectedTerm] = useState('2026-FALL');
+  const handleExportCsv = () => {
+    if (!selectedTerm) return;
+    const url = \`/api/timetables/export?term=\${encodeURIComponent(selectedTerm)}\`;
+    const anchor = document.createElement('a');
+    anchor.href = url;
+    anchor.download = \`timetable-\${selectedTerm}.csv\`;
+    anchor.click();
+  };
+
   return (
     <div className="space-y-4">
-      <h1 className="text-lg font-semibold">Faculty Timetable</h1>
+      <div className="flex items-center justify-between">
+        <h1 className="text-lg font-semibold">Faculty Timetable</h1>
+        <button
+          type="button"
+          disabled={!selectedTerm}
+          onClick={handleExportCsv}
+        >
+          Export CSV
+        </button>
+      </div>
     </div>
   );
 }`,
        },
        {
          path: 'backend/tests/test_timetables_export.py',
          layer: 'tests',
          changeType: 'added',
          additions: 24,
          deletions: 0,
          language: 'python',
          diff: `diff --git a/backend/tests/test_timetables_export.py b/backend/tests/test_timetables_export.py
new file mode 100644
index 0000000..c18d40a
--- /dev/null
+++ b/backend/tests/test_timetables_export.py
@@ -0,0 +1,24 @@
+import pytest
+from app.routers.timetables import sanitize_csv_cell
+
+def test_export_csv_sanitizes_formula_prefix():
+    assert sanitize_csv_cell("=SUM(A1:A2)") == "'=SUM(A1:A2)"
+    assert sanitize_csv_cell("CS-101") == "CS-101"`,
        },
      ],
      testRuns: [
        {
          id: 'tr-108-1',
          attemptNumber: 1,
          runner: 'docker-sandbox / pytest 8.3 (isolated, --network=none)',
          command: 'pytest backend/tests/test_timetables_export.py -v',
          exitCode: 0,
          passedCount: 4,
          failedCount: 0,
          durationMs: 980,
          executedAt: '2026-11-24T10:39:00Z',
          simulated: true,
          cases: [
            {
              id: 'tc-108-1',
              name: 'test_export_csv_headers',
              file: 'backend/tests/test_timetables_export.py',
              status: 'passed',
              durationMs: 240,
            },
            {
              id: 'tc-108-2',
              name: 'test_export_csv_filters_term',
              file: 'backend/tests/test_timetables_export.py',
              status: 'passed',
              durationMs: 290,
            },
            {
              id: 'tc-108-3',
              name: 'test_export_csv_sanitizes_formula_prefix',
              file: 'backend/tests/test_timetables_export.py',
              status: 'passed',
              durationMs: 180,
            },
            {
              id: 'tc-108-4',
              name: 'test_export_missing_term_422',
              file: 'backend/tests/test_timetables_export.py',
              status: 'passed',
              durationMs: 270,
            },
          ],
          rawOutput: `============================= test session starts ==============================
sandbox: --network=none --read-only --user=1000:1000
collected 4 items

backend/tests/test_timetables_export.py::test_export_csv_headers PASSED
backend/tests/test_timetables_export.py::test_export_csv_filters_term PASSED
backend/tests/test_timetables_export.py::test_export_csv_sanitizes_formula_prefix PASSED
backend/tests/test_timetables_export.py::test_export_missing_term_422 PASSED

============================== 4 passed in 0.98s (exit code 0) ==============================`,
        },
      ],
      findings: [
        {
          id: 'rf-108-1',
          filePath: 'backend/app/routers/timetables.py',
          line: 38,
          severity: 'suggestion',
          author: 'Code reviewer agent',
          message:
            'Validate `term` against ^[0-9]{4}-(SPRING|SUMMER|FALL)$ before interpolating into Content-Disposition filename.',
          resolved: false,
        },
      ],
      reviewHistory: [],
      pullRequest: {
        number: 184,
        title: 'CW-108: Faculty timetable CSV export with term filter',
        branchName: 'calder/cw-108-timetable-csv',
        baseBranch: 'main',
        url: 'https://github.com/calder-clients/campus-operations/pull/184',
        isDraft: false,
        headSha: sha108,
        approvedSha: null,
        approvedBy: null,
        approvedAt: null,
        status: 'open',
        mergeCommitSha: null,
        mergedBy: null,
        mergedAt: null,
        simulated: true,
      },
    },
    {
      id: 'run-wi-104-1',
      workItemId: 'wi-104',
      runNumber: 1,
      revisionNumber: 1,
      commitSha: sha104,
      status: 'merged',
      simulated: true,
      createdAt: '2026-11-20T14:12:00Z',
      updatedAt: '2026-11-20T16:10:00Z',
      autoCorrectionAttempts: 0,
      maxAutoCorrectionAttempts: MAX_AUTO_CORRECTION_ATTEMPTS,
      steps: [],
      changedFiles: [],
      testRuns: [
        {
          id: 'tr-104-1',
          attemptNumber: 1,
          runner: 'docker-sandbox / pytest 8.3',
          command: 'pytest backend/tests/test_bookings.py -v',
          exitCode: 0,
          passedCount: 7,
          failedCount: 0,
          durationMs: 1120,
          executedAt: '2026-11-20T14:20:00Z',
          simulated: true,
          cases: [],
          rawOutput: '7 passed in 1.12s (exit code 0)',
        },
      ],
      findings: [],
      reviewHistory: [
        {
          id: 'rev-104-1',
          action: 'approved',
          reviewer: 'Martin Novak',
          commitSha: sha104,
          comment: 'Exclusion constraint and 409 response verified.',
          createdAt: '2026-11-20T16:02:00Z',
          simulated: true,
        },
      ],
      pullRequest: {
        number: 179,
        title: 'CW-104: Seminar room booking overlap conflict check',
        branchName: 'calder/cw-104-room-conflicts',
        baseBranch: 'main',
        url: 'https://github.com/calder-clients/campus-operations/pull/179',
        isDraft: false,
        headSha: sha104,
        approvedSha: sha104,
        approvedBy: 'Martin Novak',
        approvedAt: '2026-11-20T16:02:00Z',
        status: 'merged',
        mergeCommitSha: merge104,
        mergedBy: 'Martin Novak',
        mergedAt: '2026-11-20T16:10:00Z',
        simulated: true,
      },
    },
    {
      id: 'run-wi-112-1',
      workItemId: 'wi-112',
      runNumber: 1,
      revisionNumber: 1,
      commitSha: sha112,
      status: 'paused_human_decision',
      simulated: true,
      createdAt: '2026-11-24T15:10:00Z',
      updatedAt: '2026-11-24T15:24:00Z',
      autoCorrectionAttempts: 2,
      maxAutoCorrectionAttempts: MAX_AUTO_CORRECTION_ATTEMPTS,
      pauseReason:
        'Automatic correction limit reached (2 / 2). Legacy 6-digit draft manifests still fail strict 8-digit HS tariff check. Confirm whether drafts should bypass strict validation before resuming.',
      steps: [
        {
          id: 's112-1',
          role: 'requirements_analyst',
          label: 'Requirements analyst',
          stageOrder: 1,
          status: 'completed',
          durationMs: 820,
          inputsSummary: 'Work item CW-112 request',
          outputsSummary: '2 criteria locked; 1 legacy compatibility flag noted',
        },
        {
          id: 's112-2',
          role: 'architect',
          label: 'Architect',
          stageOrder: 2,
          status: 'completed',
          durationMs: 1410,
          inputsSummary: 'calder-clients/harbour-freight-portal@main',
          outputsSummary: 'Tariff validator service contract',
        },
        {
          id: 's112-3',
          role: 'python_engineer',
          label: 'Python engineer',
          stageOrder: 3,
          parallelGroup: 'implementation',
          status: 'completed',
          durationMs: 2050,
          inputsSummary: 'Tariff validator contract',
          outputsSummary: 'Modified backend/app/services/tariff.py',
        },
        {
          id: 's112-4',
          role: 'react_engineer',
          label: 'React engineer',
          stageOrder: 3,
          parallelGroup: 'implementation',
          status: 'completed',
          durationMs: 1730,
          inputsSummary: 'Manifest validation error display',
          outputsSummary: 'Modified frontend/src/pages/ManifestForm.tsx',
        },
        {
          id: 's112-5',
          role: 'test_engineer',
          label: 'Test engineer',
          stageOrder: 4,
          status: 'failed',
          durationMs: 1340,
          inputsSummary: 'Attempt 3 post-correction test verification',
          outputsSummary: 'Exit code 1 · 5 passed, 1 failed',
          errorMessage:
            'test_legacy_six_digit_draft_manifest_allowed FAILED — AssertionError: expected 200, got 422',
          artifact: {
            kind: 'test_report',
            title: 'Failing Sandbox Run (Exit Code 1)',
            summary: '1 test continues to fail after 2 automatic correction attempts.',
            content:
              'FAILED backend/tests/test_manifest_tariff.py::test_legacy_six_digit_draft_manifest_allowed\nE AssertionError: assert 422 == 200\nE {"detail": "HS tariff code 847130 must be 8 digits"}\n1 failed, 5 passed in 1.34s (exit code 1)',
          },
        },
        {
          id: 's112-6',
          role: 'bug_detection_agent',
          label: 'Bug detection agent',
          stageOrder: 5,
          status: 'failed',
          durationMs: 990,
          inputsSummary: '2 consecutive test failures on conflicting requirements',
          outputsSummary: 'Paused after 2/2 auto-corrections; requires engineering manager decision',
          errorMessage:
            'Conflicting acceptance criteria: strict 8-digit validation vs legacy 6-digit draft compatibility.',
          artifact: {
            kind: 'bug_report',
            title: 'Escalated to Human Decision (2 / 2 Attempts Exhausted)',
            summary: 'Run halted per Calder Works policy after 2 failed automatic fixes.',
            content:
              'Attempt 1: Relaxed draft check -> broke strict submission test.\nAttempt 2: Restored strict check -> broke legacy 6-digit draft fixture.\nNext action: Engineering manager must specify whether draft status skips 8-digit check, then resume run.',
          },
        },
        {
          id: 's112-7',
          role: 'code_reviewer',
          label: 'Code reviewer',
          stageOrder: 6,
          status: 'pending',
          inputsSummary: 'Waiting for passing test run',
          outputsSummary: 'Blocked until tests pass',
        },
        {
          id: 's112-8',
          role: 'documentation_writer',
          label: 'Documentation writer',
          stageOrder: 7,
          status: 'pending',
          inputsSummary: 'Waiting for code review completion',
          outputsSummary: 'Blocked',
        },
      ],
      changedFiles: [
        {
          path: 'backend/app/services/tariff.py',
          layer: 'backend',
          changeType: 'modified',
          additions: 14,
          deletions: 3,
          language: 'python',
          diff: `diff --git a/backend/app/services/tariff.py b/backend/app/services/tariff.py
index 901ab23..33ef901 100644
--- a/backend/app/services/tariff.py
+++ b/backend/app/services/tariff.py
@@ -12,6 +12,17 @@ def validate_hs_code(code: str, is_draft: bool = False) -> None:
-    if len(code) < 6:
-        raise ValueError("HS tariff code too short")
+    cleaned = code.strip()
+    if len(cleaned) != 8 or not cleaned.isdigit():
+        raise ValueError(f"HS tariff code {cleaned} must be 8 digits")`,
        },
      ],
      testRuns: [
        {
          id: 'tr-112-2',
          attemptNumber: 2,
          runner: 'docker-sandbox / pytest 8.3 (isolated, --network=none)',
          command: 'pytest backend/tests/test_manifest_tariff.py -v',
          exitCode: 1,
          passedCount: 5,
          failedCount: 1,
          durationMs: 1340,
          executedAt: '2026-11-24T15:23:00Z',
          simulated: true,
          cases: [
            {
              id: 'tc-112-1',
              name: 'test_valid_eight_digit_tariff_code',
              file: 'backend/tests/test_manifest_tariff.py',
              status: 'passed',
              durationMs: 210,
            },
            {
              id: 'tc-112-2',
              name: 'test_invalid_tariff_checksum_returns_422',
              file: 'backend/tests/test_manifest_tariff.py',
              status: 'passed',
              durationMs: 195,
            },
            {
              id: 'tc-112-3',
              name: 'test_legacy_six_digit_draft_manifest_allowed',
              file: 'backend/tests/test_manifest_tariff.py',
              status: 'failed',
              durationMs: 320,
              errorDetail: 'AssertionError: assert 422 == 200 ("HS tariff code 847130 must be 8 digits")',
            },
          ],
          rawOutput: `FAILED backend/tests/test_manifest_tariff.py::test_legacy_six_digit_draft_manifest_allowed
E AssertionError: assert 422 == 200
1 failed, 5 passed in 1.34s (exit code 1)`,
        },
      ],
      findings: [],
      reviewHistory: [],
      pullRequest: {
        number: 91,
        title: 'CW-112: Customs manifest HS tariff checksum validation',
        branchName: 'calder/cw-112-tariff-validation',
        baseBranch: 'main',
        url: 'https://github.com/calder-clients/harbour-freight-portal/pull/91',
        isDraft: true,
        headSha: sha112,
        approvedSha: null,
        approvedBy: null,
        approvedAt: null,
        status: 'open',
        mergeCommitSha: null,
        mergedBy: null,
        mergedAt: null,
        simulated: true,
      },
    },
    {
      id: 'run-wi-101-1',
      workItemId: 'wi-101',
      runNumber: 1,
      revisionNumber: 1,
      commitSha: sha101,
      status: 'merged',
      simulated: true,
      createdAt: '2026-11-18T09:45:00Z',
      updatedAt: '2026-11-18T11:45:00Z',
      autoCorrectionAttempts: 0,
      maxAutoCorrectionAttempts: MAX_AUTO_CORRECTION_ATTEMPTS,
      steps: [],
      changedFiles: [],
      testRuns: [
        {
          id: 'tr-101-1',
          attemptNumber: 1,
          runner: 'docker-sandbox / pytest 8.3',
          command: 'pytest backend/tests/test_notifications.py -v',
          exitCode: 0,
          passedCount: 5,
          failedCount: 0,
          durationMs: 890,
          executedAt: '2026-11-18T10:00:00Z',
          simulated: true,
          cases: [],
          rawOutput: '5 passed in 0.89s (exit code 0)',
        },
      ],
      findings: [],
      reviewHistory: [
        {
          id: 'rev-101-1',
          action: 'approved',
          reviewer: 'Priya Nair',
          commitSha: sha101,
          comment: 'Audit timestamp persistence and opt-out tests look clean.',
          createdAt: '2026-11-18T11:30:00Z',
          simulated: true,
        },
      ],
      pullRequest: {
        number: 63,
        title: 'CW-101: SMS appointment reminder opt-out endpoint',
        branchName: 'calder/cw-101-sms-opt-out',
        baseBranch: 'main',
        url: 'https://github.com/calder-clients/northfield-clinic-api/pull/63',
        isDraft: false,
        headSha: sha101,
        approvedSha: sha101,
        approvedBy: 'Priya Nair',
        approvedAt: '2026-11-18T11:30:00Z',
        status: 'merged',
        mergeCommitSha: merge101,
        mergedBy: 'Priya Nair',
        mergedAt: '2026-11-18T11:45:00Z',
        simulated: true,
      },
    },
  ];

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const githubConnected = Boolean(process.env.GITHUB_TOKEN?.trim());
  const requestedMode =
    process.env.CALDER_WORKSPACE_MODE === 'connected' && githubConnected
      ? 'connected'
      : 'demo';

  return {
    projects,
    workItems,
    runs,
    reviewers: ['Priya Nair', 'Martin Novak', 'Owen Fraser', 'Hannah Reid'],
    connection: {
      mode: requestedMode,
      githubConnected,
      githubAccount: githubConnected ? 'Connected via server token' : null,
      selectedRepository: 'calder-clients/campus-operations',
      geminiConfigured,
      dockerSandboxAvailable: false,
      postgresConnected: false,
      lastCheckedAt: new Date().toISOString(),
      statusMessage:
        requestedMode === 'connected'
          ? 'Connected mode active using server-side credentials.'
          : 'Demo workspace active — preview cannot run Docker, Python, or GitHub writes, so workflow runs and PR actions are simulated and persisted locally.',
    },
  };
}

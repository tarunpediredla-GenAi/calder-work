import {
  buildDeterministicSha,
  MAX_AUTO_CORRECTION_ATTEMPTS,
  shortSha,
} from '../lib/workflow';
import type {
  AcceptanceCriterion,
  AgentStep,
  ChangedFile,
  DeliveryRun,
  MissingInfoFlag,
  Project,
  ReviewFinding,
  TestRunRecord,
  WorkItem,
} from '../types/calder';

export const STUDENT_REGISTER_DEMO_REQUEST =
  'Give the college administrator a student register. Staff should be able to add a student using a roll number, name and department, search by roll number, and see a clear error if the roll number already exists.';

function isStudentRegisterRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('student') &&
    (lower.includes('roll number') || lower.includes('register'))
  );
}

export function deriveTitleFromRequest(requestText: string): string {
  if (isStudentRegisterRequest(requestText)) {
    return 'Student register with roll number search and duplicate guard';
  }
  const clean = requestText.trim().replace(/\s+/g, ' ');
  const firstSentence = clean.split(/[.!?]/)[0]?.trim() || clean;
  return firstSentence.length > 72
    ? `${firstSentence.slice(0, 69)}...`
    : firstSentence;
}

export function buildInitialCriteriaAndFlags(requestText: string): {
  criteria: AcceptanceCriterion[];
  flags: MissingInfoFlag[];
} {
  if (isStudentRegisterRequest(requestText)) {
    return {
      criteria: [
        {
          id: 'ac-1',
          text: 'POST /api/students creates a student record with roll_number, full_name, and department, returning HTTP 201 and the saved record.',
          category: 'functional',
          verified: false,
        },
        {
          id: 'ac-2',
          text: 'Duplicate roll_number submissions (case-insensitive after trimming whitespace) return HTTP 409 Conflict with a clear message identifying the conflicting roll number.',
          category: 'validation',
          verified: false,
        },
        {
          id: 'ac-3',
          text: 'GET /api/students?roll_number=<query> filters the student register by roll number prefix or exact match and returns matching records ordered by roll_number.',
          category: 'functional',
          verified: false,
        },
        {
          id: 'ac-4',
          text: 'College administrator UI displays a student creation form (roll number, name, department), live roll-number search input, and inline error banner when a duplicate roll number is submitted.',
          category: 'ui',
          verified: false,
        },
        {
          id: 'ac-5',
          text: 'Automated pytest suite verifies student creation, roll-number search, empty-field validation, and duplicate roll number HTTP 409 rejection.',
          category: 'testing',
          verified: false,
        },
      ],
      flags: [
        {
          id: 'flag-1',
          question:
            'Should roll numbers be normalized to uppercase (e.g. cs-2026-014 -> CS-2026-014) before uniqueness checks?',
          severity: 'clarification',
          resolution:
            'Default assumption: trim whitespace and enforce case-insensitive unique index while storing canonical uppercase.',
        },
        {
          id: 'flag-2',
          question:
            'Is department a free-text field or restricted to an approved college department list?',
          severity: 'clarification',
          resolution:
            'Default assumption: validated non-empty string with common department suggestions in the UI.',
        },
      ],
    };
  }

  const title = deriveTitleFromRequest(requestText);
  return {
    criteria: [
      {
        id: 'ac-1',
        text: `Expose typed FastAPI endpoints and PostgreSQL persistence supporting: ${title}.`,
        category: 'functional',
        verified: false,
      },
      {
        id: 'ac-2',
        text: 'Validate all incoming fields with Pydantic v2 schemas and return structured HTTP 409 / 422 errors on invalid or conflicting records.',
        category: 'validation',
        verified: false,
      },
      {
        id: 'ac-3',
        text: 'Provide a responsive React + TypeScript interface connected to the contract with clear loading, empty, and error states.',
        category: 'ui',
        verified: false,
      },
      {
        id: 'ac-4',
        text: 'Include isolated pytest integration tests covering happy path, search/filter behavior, and validation failures.',
        category: 'testing',
        verified: false,
      },
    ],
    flags: [
      {
        id: 'flag-1',
        question:
          'Confirm whether existing role-based staff middleware should guard write operations on this feature.',
        severity: 'clarification',
        resolution: 'Default assumption: reuse standard staff session guard.',
      },
    ],
  };
}

function buildStudentRegisterFiles(
  revisionNumber: number,
  revisionNote?: string
): ChangedFile[] {
  const isRevised = revisionNumber > 1;
  const normalizedNote = (revisionNote || '').trim();

  const routerDiff = isRevised
    ? `diff --git a/backend/app/routers/students.py b/backend/app/routers/students.py
new file mode 100644
index 0000000..8f2d10a
--- /dev/null
+++ b/backend/app/routers/students.py
@@ -0,0 +1,58 @@
+from fastapi import APIRouter, Depends, HTTPException, Query, status
+from sqlalchemy import func, select
+from sqlalchemy.exc import IntegrityError
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.db import get_session
+from app.models.student import Student
+from app.schemas.student import StudentCreate, StudentListResponse, StudentOut
+
+router = APIRouter(prefix="/api/students", tags=["students"])
+
+
+def normalize_roll_number(raw: str) -> str:
+    return " ".join(raw.strip().split()).upper()
+
+
+@router.get("", response_model=StudentListResponse)
+async def list_students(
+    roll_number: str | None = Query(default=None, max_length=32),
+    session: AsyncSession = Depends(get_session),
+) -> StudentListResponse:
+    stmt = select(Student).order_by(Student.roll_number.asc())
+    if roll_number and roll_number.strip():
+        pattern = f"{normalize_roll_number(roll_number)}%"
+        stmt = stmt.where(func.upper(Student.roll_number).like(pattern))
+    rows = (await session.execute(stmt)).scalars().all()
+    return StudentListResponse(items=[StudentOut.model_validate(r) for r in rows], total=len(rows))
+
+
+@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
+async def create_student(
+    payload: StudentCreate,
+    session: AsyncSession = Depends(get_session),
+) -> StudentOut:
+    canonical_roll = normalize_roll_number(payload.roll_number)
+    existing = await session.scalar(
+        select(Student).where(func.upper(Student.roll_number) == canonical_roll)
+    )
+    if existing is not None:
+        raise HTTPException(
+            status_code=status.HTTP_409_CONFLICT,
+            detail={
+                "code": "DUPLICATE_ROLL_NUMBER",
+                "message": f"Roll number {canonical_roll} already belongs to {existing.full_name} ({existing.department}).",
+                "roll_number": canonical_roll,
+            },
+        )
+    student = Student(
+        roll_number=canonical_roll,
+        full_name=payload.full_name.strip(),
+        department=payload.department.strip(),
+    )
+    session.add(student)
+    try:
+        await session.commit()
+    except IntegrityError as exc:
+        await session.rollback()
+        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Roll number {canonical_roll} already exists.") from exc
+    await session.refresh(student)
+    return StudentOut.model_validate(student)`
    : `diff --git a/backend/app/routers/students.py b/backend/app/routers/students.py
new file mode 100644
index 0000000..4b91e21
--- /dev/null
+++ b/backend/app/routers/students.py
@@ -0,0 +1,46 @@
+from fastapi import APIRouter, Depends, HTTPException, Query, status
+from sqlalchemy import func, select
+from sqlalchemy.exc import IntegrityError
+from sqlalchemy.ext.asyncio import AsyncSession
+
+from app.db import get_session
+from app.models.student import Student
+from app.schemas.student import StudentCreate, StudentListResponse, StudentOut
+
+router = APIRouter(prefix="/api/students", tags=["students"])
+
+
+@router.get("", response_model=StudentListResponse)
+async def list_students(
+    roll_number: str | None = Query(default=None, max_length=32),
+    session: AsyncSession = Depends(get_session),
+) -> StudentListResponse:
+    stmt = select(Student).order_by(Student.roll_number.asc())
+    if roll_number and roll_number.strip():
+        pattern = f"{roll_number.strip().upper()}%"
+        stmt = stmt.where(func.upper(Student.roll_number).like(pattern))
+    rows = (await session.execute(stmt)).scalars().all()
+    return StudentListResponse(items=[StudentOut.model_validate(r) for r in rows], total=len(rows))
+
+
+@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
+async def create_student(
+    payload: StudentCreate,
+    session: AsyncSession = Depends(get_session),
+) -> StudentOut:
+    canonical_roll = payload.roll_number.strip().upper()
+    existing = await session.scalar(
+        select(Student).where(func.upper(Student.roll_number) == canonical_roll)
+    )
+    if existing is not None:
+        raise HTTPException(
+            status_code=status.HTTP_409_CONFLICT,
+            detail=f"Roll number {canonical_roll} already exists in the student register.",
+        )
+    student = Student(
+        roll_number=canonical_roll,
+        full_name=payload.full_name.strip(),
+        department=payload.department.strip(),
+    )
+    session.add(student)
+    try:
+        await session.commit()
+    except IntegrityError as exc:
+        await session.rollback()
+        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Roll number {canonical_roll} already exists.") from exc
+    await session.refresh(student)
+    return StudentOut.model_validate(student)`;

  const modelDiff = `diff --git a/backend/app/models/student.py b/backend/app/models/student.py
new file mode 100644
index 0000000..9c31274
--- /dev/null
+++ b/backend/app/models/student.py
@@ -0,0 +1,22 @@
+from datetime import datetime, timezone
+from sqlalchemy import DateTime, Index, String, func
+from sqlalchemy.orm import Mapped, mapped_column
+
+from app.models.base import Base
+
+
+class Student(Base):
+    __tablename__ = "students"
+
+    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
+    roll_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
+    full_name: Mapped[str] = mapped_column(String(140), nullable=False)
+    department: Mapped[str] = mapped_column(String(100), nullable=False)
+    created_at: Mapped[datetime] = mapped_column(
+        DateTime(timezone=True),
+        default=lambda: datetime.now(timezone.utc),
+        nullable=False,
+    )
+
+    __table_args__ = (
+        Index("uq_students_roll_number_upper", func.upper(roll_number), unique=True),
+    )`;

  const uiDiff = isRevised
    ? `diff --git a/frontend/src/pages/StudentRegisterPage.tsx b/frontend/src/pages/StudentRegisterPage.tsx
new file mode 100644
index 0000000..d418c9b
--- /dev/null
+++ b/frontend/src/pages/StudentRegisterPage.tsx
@@ -0,0 +1,78 @@
+import { FormEvent, useEffect, useState } from 'react';
+import { createStudent, fetchStudents, StudentRecord } from '../api/students';
+
+// Updated in revision ${revisionNumber}${normalizedNote ? `: ${normalizedNote.slice(0, 80)}` : ''}
+export function StudentRegisterPage() {
+  const [students, setStudents] = useState<StudentRecord[]>([]);
+  const [searchRoll, setSearchRoll] = useState('');
+  const [rollNumber, setRollNumber] = useState('');
+  const [fullName, setFullName] = useState('');
+  const [department, setDepartment] = useState('');
+  const [errorMessage, setErrorMessage] = useState<string | null>(null);
+  const [submitting, setSubmitting] = useState(false);
+
+  useEffect(() => {
+    const controller = new AbortController();
+    fetchStudents(searchRoll.trim(), controller.signal)
+      .then((res) => setStudents(res.items))
+      .catch((err) => {
+        if (err.name !== 'AbortError') setErrorMessage('Unable to load student register.');
+      });
+    return () => controller.abort();
+  }, [searchRoll]);
+
+  async function handleSubmit(event: FormEvent) {
+    event.preventDefault();
+    setErrorMessage(null);
+    const trimmedRoll = rollNumber.trim().replace(/\\s+/g, ' ').toUpperCase();
+    if (!trimmedRoll || !fullName.trim() || !department.trim()) {
+      setErrorMessage('Roll number, student name, and department are all required.');
+      return;
+    }
+    setSubmitting(true);
+    try {
+      const created = await createStudent({
+        roll_number: trimmedRoll,
+        full_name: fullName.trim(),
+        department: department.trim(),
+      });
+      setStudents((prev) => [...prev, created].sort((a, b) => a.roll_number.localeCompare(b.roll_number)));
+      setRollNumber('');
+      setFullName('');
+      setDepartment('');
+    } catch (err) {
+      setErrorMessage(err instanceof Error ? err.message : 'Failed to register student.');
+    } finally {
+      setSubmitting(false);
+    }
+  }
+
+  return (
+    <section className="space-y-6">
+      <header className="flex flex-wrap items-center justify-between gap-4">
+        <h1 className="text-xl font-semibold">Student register</h1>
+        <input
+          type="search"
+          value={searchRoll}
+          onChange={(e) => setSearchRoll(e.target.value)}
+          placeholder="Search by roll number..."
+          aria-label="Search by roll number"
+          className="border px-3 py-1.5 text-sm font-mono"
+        />
+      </header>
+      {errorMessage && (
+        <div role="alert" className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
+          {errorMessage}
+        </div>
+      )}
+      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-4">
+        <input value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} placeholder="Roll number (e.g. CS-2026-041)" />
+        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
+        <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" />
+        <button type="submit" disabled={submitting}>{submitting ? 'Adding...' : 'Add student'}</button>
+      </form>
+      <table className="w-full text-left text-sm">
+        <thead><tr><th>Roll number</th><th>Name</th><th>Department</th></tr></thead>
+        <tbody>
+          {students.map((s) => (
+            <tr key={s.id}><td className="font-mono">{s.roll_number}</td><td>{s.full_name}</td><td>{s.department}</td></tr>
+          ))}
+        </tbody>
+      </table>
+    </section>
+  );
+}`
    : `diff --git a/frontend/src/pages/StudentRegisterPage.tsx b/frontend/src/pages/StudentRegisterPage.tsx
new file mode 100644
index 0000000..7a2f80c
--- /dev/null
+++ b/frontend/src/pages/StudentRegisterPage.tsx
@@ -0,0 +1,66 @@
+import { FormEvent, useEffect, useState } from 'react';
+import { createStudent, fetchStudents, StudentRecord } from '../api/students';
+
+export function StudentRegisterPage() {
+  const [students, setStudents] = useState<StudentRecord[]>([]);
+  const [searchRoll, setSearchRoll] = useState('');
+  const [rollNumber, setRollNumber] = useState('');
+  const [fullName, setFullName] = useState('');
+  const [department, setDepartment] = useState('');
+  const [errorMessage, setErrorMessage] = useState<string | null>(null);
+
+  useEffect(() => {
+    fetchStudents(searchRoll).then((res) => setStudents(res.items));
+  }, [searchRoll]);
+
+  async function handleSubmit(event: FormEvent) {
+    event.preventDefault();
+    setErrorMessage(null);
+    try {
+      const created = await createStudent({
+        roll_number: rollNumber,
+        full_name: fullName,
+        department: department,
+      });
+      setStudents((prev) => [...prev, created]);
+      setRollNumber('');
+      setFullName('');
+      setDepartment('');
+    } catch (err) {
+      setErrorMessage(err instanceof Error ? err.message : 'Failed to register student.');
+    }
+  }
+
+  return (
+    <section className="space-y-6">
+      <header className="flex items-center justify-between">
+        <h1 className="text-xl font-semibold">Student register</h1>
+        <input
+          type="search"
+          value={searchRoll}
+          onChange={(e) => setSearchRoll(e.target.value)}
+          placeholder="Search by roll number..."
+          aria-label="Search by roll number"
+        />
+      </header>
+      {errorMessage && (
+        <div role="alert" className="border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
+          {errorMessage}
+        </div>
+      )}
+      <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-3">
+        <input value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} placeholder="Roll number" />
+        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
+        <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" />
+        <button type="submit">Add student</button>
+      </form>
+      <table className="w-full text-left text-sm">
+        <thead><tr><th>Roll number</th><th>Name</th><th>Department</th></tr></thead>
+        <tbody>
+          {students.map((s) => (
+            <tr key={s.id}><td className="font-mono">{s.roll_number}</td><td>{s.full_name}</td><td>{s.department}</td></tr>
+          ))}
+        </tbody>
+      </table>
+    </section>
+  );
+}`;

  const testDiff = isRevised
    ? `diff --git a/backend/tests/test_students.py b/backend/tests/test_students.py
new file mode 100644
index 0000000..f103b7e
--- /dev/null
+++ b/backend/tests/test_students.py
@@ -0,0 +1,52 @@
+import pytest
+from httpx import AsyncClient
+
+
+@pytest.mark.asyncio
+async def test_create_student_and_search_by_roll_number(client: AsyncClient):
+    resp = await client.post(
+        "/api/students",
+        json={"roll_number": "CS-2026-014", "full_name": "Amina Patel", "department": "Computer Science"},
+    )
+    assert resp.status_code == 201
+    assert resp.json()["roll_number"] == "CS-2026-014"
+
+    search = await client.get("/api/students", params={"roll_number": "CS-2026"})
+    assert search.status_code == 200
+    assert search.json()["total"] == 1
+    assert search.json()["items"][0]["full_name"] == "Amina Patel"
+
+
+@pytest.mark.asyncio
+async def test_create_student_duplicate_roll_number_returns_409(client: AsyncClient):
+    first = await client.post(
+        "/api/students",
+        json={"roll_number": "EE-2026-008", "full_name": "Daniel Osei", "department": "Electrical Engineering"},
+    )
+    assert first.status_code == 201
+
+    duplicate = await client.post(
+        "/api/students",
+        json={"roll_number": "  ee-2026-008  ", "full_name": "Duplicate Entry", "department": "Physics"},
+    )
+    assert duplicate.status_code == 409
+    body = duplicate.json()["detail"]
+    assert body["code"] == "DUPLICATE_ROLL_NUMBER"
+    assert "EE-2026-008" in body["message"]
+    assert "Daniel Osei" in body["message"]
+
+
+@pytest.mark.asyncio
+async def test_reviewer_revision_whitespace_normalization(client: AsyncClient):
+    resp = await client.post(
+        "/api/students",
+        json={"roll_number": "  me-2026-102 ", "full_name": "Hannah Lind", "department": "Mechanical"},
+    )
+    assert resp.status_code == 201
+    assert resp.json()["roll_number"] == "ME-2026-102"`
    : `diff --git a/backend/tests/test_students.py b/backend/tests/test_students.py
new file mode 100644
index 0000000..c8192a4
--- /dev/null
+++ b/backend/tests/test_students.py
@@ -0,0 +1,38 @@
+import pytest
+from httpx import AsyncClient
+
+
+@pytest.mark.asyncio
+async def test_create_student_and_search_by_roll_number(client: AsyncClient):
+    resp = await client.post(
+        "/api/students",
+        json={"roll_number": "CS-2026-014", "full_name": "Amina Patel", "department": "Computer Science"},
+    )
+    assert resp.status_code == 201
+    assert resp.json()["roll_number"] == "CS-2026-014"
+
+    search = await client.get("/api/students", params={"roll_number": "CS-2026"})
+    assert search.status_code == 200
+    assert search.json()["total"] == 1
+    assert search.json()["items"][0]["full_name"] == "Amina Patel"
+
+
+@pytest.mark.asyncio
+async def test_create_student_duplicate_roll_number_returns_409(client: AsyncClient):
+    first = await client.post(
+        "/api/students",
+        json={"roll_number": "EE-2026-008", "full_name": "Daniel Osei", "department": "Electrical Engineering"},
+    )
+    assert first.status_code == 201
+
+    duplicate = await client.post(
+        "/api/students",
+        json={"roll_number": "ee-2026-008", "full_name": "Duplicate Entry", "department": "Physics"},
+    )
+    assert duplicate.status_code == 409
+    assert "EE-2026-008" in duplicate.json()["detail"]`;

  const docsDiff = `diff --git a/docs/student-register.md b/docs/student-register.md
new file mode 100644
index 0000000..3a74c12
--- /dev/null
+++ b/docs/student-register.md
@@ -0,0 +1,18 @@
+# Student Register
+
+Adds staff-facing student registration and roll-number lookup for Campus Operations.
+
+## Endpoints
+- \`GET /api/students?roll_number=<prefix>\` — lists or filters students by roll number.
+- \`POST /api/students\` — creates a student; returns \`409 Conflict\` if the roll number already exists (case-insensitive, trimmed).
+
+## Database migration
+\`\`\`bash
+alembic upgrade head
+\`\`\`
+
+## Revision ${revisionNumber} notes
+${isRevised && normalizedNote ? `- Addressed reviewer request: ${normalizedNote}` : '- Initial implementation matching approved acceptance criteria.'}`;

  return [
    {
      path: 'backend/app/routers/students.py',
      layer: 'backend',
      changeType: 'added',
      additions: isRevised ? 58 : 46,
      deletions: 0,
      language: 'python',
      diff: routerDiff,
    },
    {
      path: 'backend/app/models/student.py',
      layer: 'backend',
      changeType: 'added',
      additions: 22,
      deletions: 0,
      language: 'python',
      diff: modelDiff,
    },
    {
      path: 'frontend/src/pages/StudentRegisterPage.tsx',
      layer: 'frontend',
      changeType: 'added',
      additions: isRevised ? 78 : 66,
      deletions: 0,
      language: 'typescript',
      diff: uiDiff,
    },
    {
      path: 'backend/tests/test_students.py',
      layer: 'tests',
      changeType: 'added',
      additions: isRevised ? 52 : 38,
      deletions: 0,
      language: 'python',
      diff: testDiff,
    },
    {
      path: 'docs/student-register.md',
      layer: 'docs',
      changeType: 'added',
      additions: 18,
      deletions: 0,
      language: 'markdown',
      diff: docsDiff,
    },
  ];
}

function buildGenericFiles(
  workItem: WorkItem,
  revisionNumber: number,
  revisionNote?: string
): ChangedFile[] {
  const slug = workItem.key.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const noteLine = revisionNote
    ? `+    # Revision ${revisionNumber}: ${revisionNote.slice(0, 72)}\n`
    : '';
  return [
    {
      path: `backend/app/routers/${slug}.py`,
      layer: 'backend',
      changeType: 'added',
      additions: revisionNumber > 1 ? 30 : 26,
      deletions: 0,
      language: 'python',
      diff: `diff --git a/backend/app/routers/${slug}.py b/backend/app/routers/${slug}.py
new file mode 100644
index 0000000..5c9e122
--- /dev/null
+++ b/backend/app/routers/${slug}.py
@@ -0,0 +1,26 @@
+from fastapi import APIRouter, Depends, HTTPException, status
+from sqlalchemy.ext.asyncio import AsyncSession
+from app.db import get_session
+
+router = APIRouter(prefix="/api/${slug}", tags=["${slug}"])
+
+@router.get("")
+async def list_records(session: AsyncSession = Depends(get_session)):
+${noteLine}+    return {"items": [], "work_item": "${workItem.key}"}`,
    },
    {
      path: `frontend/src/pages/${slug.toUpperCase()}View.tsx`,
      layer: 'frontend',
      changeType: 'added',
      additions: 24,
      deletions: 0,
      language: 'typescript',
      diff: `diff --git a/frontend/src/pages/${slug.toUpperCase()}View.tsx b/frontend/src/pages/${slug.toUpperCase()}View.tsx
new file mode 100644
index 0000000..a1b704e
--- /dev/null
+++ b/frontend/src/pages/${slug.toUpperCase()}View.tsx
@@ -0,0 +1,24 @@
+import { useState } from 'react';
+
+export function FeatureView() {
+  const [query, setQuery] = useState('');
+  return (
+    <section className="space-y-4">
+      <h1>${workItem.title}</h1>
+      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter records..." />
+    </section>
+  );
+}`,
    },
    {
      path: `backend/tests/test_${slug}.py`,
      layer: 'tests',
      changeType: 'added',
      additions: 18,
      deletions: 0,
      language: 'python',
      diff: `diff --git a/backend/tests/test_${slug}.py b/backend/tests/test_${slug}.py
new file mode 100644
index 0000000..77d3f01
--- /dev/null
+++ b/backend/tests/test_${slug}.py
@@ -0,0 +1,18 @@
+import pytest
+
+@pytest.mark.asyncio
+async def test_endpoint_contract(client):
+    res = await client.get("/api/${slug}")
+    assert res.status_code == 200`,
    },
  ];
}

function buildTestRuns(
  workItem: WorkItem,
  revisionNumber: number,
  nowIso: string,
  revisionNote?: string
): TestRunRecord[] {
  const isStudent = isStudentRegisterRequest(workItem.requestText);

  if (isStudent) {
    const attempt1: TestRunRecord = {
      id: `tr-${workItem.id}-r${revisionNumber}-a1`,
      attemptNumber: 1,
      runner: 'docker-sandbox / pytest 8.3 (isolated, --network=none)',
      command: 'pytest backend/tests/test_students.py -v --tb=short',
      exitCode: 1,
      passedCount: 4,
      failedCount: 1,
      durationMs: 1180,
      executedAt: nowIso,
      simulated: true,
      cases: [
        {
          id: 'tc-1',
          name: 'test_create_student_and_search_by_roll_number',
          file: 'backend/tests/test_students.py',
          status: 'passed',
          durationMs: 220,
        },
        {
          id: 'tc-2',
          name: 'test_search_roll_number_empty_returns_all_sorted',
          file: 'backend/tests/test_students.py',
          status: 'passed',
          durationMs: 185,
        },
        {
          id: 'tc-3',
          name: 'test_reject_missing_department_returns_422',
          file: 'backend/tests/test_students.py',
          status: 'passed',
          durationMs: 140,
        },
        {
          id: 'tc-4',
          name: 'test_create_student_duplicate_roll_number_returns_409',
          file: 'backend/tests/test_students.py',
          status: 'failed',
          durationMs: 310,
          errorDetail:
            'AssertionError: assert 500 == 409 (unhandled IntegrityError on lowercase duplicate "ee-2026-008")',
        },
        {
          id: 'tc-5',
          name: 'StudentRegisterPage renders duplicate roll number alert',
          file: 'frontend/src/pages/StudentRegisterPage.test.tsx',
          status: 'passed',
          durationMs: 325,
        },
      ],
      rawOutput: `============================= test session starts ==============================
platform linux -- Python 3.12.7, pytest-8.3.3, asyncio-0.24.0
sandbox: --network=none --read-only --user=1000:1000 (credentials stripped)
collected 5 items

backend/tests/test_students.py::test_create_student_and_search_by_roll_number PASSED [ 20%]
backend/tests/test_students.py::test_search_roll_number_empty_returns_all_sorted PASSED [ 40%]
backend/tests/test_students.py::test_reject_missing_department_returns_422 PASSED [ 60%]
backend/tests/test_students.py::test_create_student_duplicate_roll_number_returns_409 FAILED [ 80%]
frontend/src/pages/StudentRegisterPage.test.tsx::renders_duplicate_alert PASSED [100%]

=================================== FAILURES ===================================
_____________ test_create_student_duplicate_roll_number_returns_409 ____________
backend/tests/test_students.py:29: in test_create_student_duplicate_roll_number_returns_409
    assert duplicate.status_code == 409
E   AssertionError: assert 500 == 409
E   psycopg.errors.UniqueViolation: duplicate key value violates unique constraint "uq_students_roll_number_upper"
=========================== short test summary info ============================
FAILED backend/tests/test_students.py::test_create_student_duplicate_roll_number_returns_409
1 failed, 4 passed in 1.18s (exit code 1)`,
    };

    const extraCases =
      revisionNumber > 1
        ? [
            {
              id: 'tc-6',
              name: 'test_reviewer_revision_whitespace_normalization',
              file: 'backend/tests/test_students.py',
              status: 'passed' as const,
              durationMs: 164,
            },
          ]
        : [];

    const passedCases = [
      {
        id: 'tc-1',
        name: 'test_create_student_and_search_by_roll_number',
        file: 'backend/tests/test_students.py',
        status: 'passed' as const,
        durationMs: 204,
      },
      {
        id: 'tc-2',
        name: 'test_search_roll_number_empty_returns_all_sorted',
        file: 'backend/tests/test_students.py',
        status: 'passed' as const,
        durationMs: 172,
      },
      {
        id: 'tc-3',
        name: 'test_reject_missing_department_returns_422',
        file: 'backend/tests/test_students.py',
        status: 'passed' as const,
        durationMs: 138,
      },
      {
        id: 'tc-4',
        name: 'test_create_student_duplicate_roll_number_returns_409',
        file: 'backend/tests/test_students.py',
        status: 'passed' as const,
        durationMs: 245,
      },
      {
        id: 'tc-5',
        name: 'StudentRegisterPage renders duplicate roll number alert',
        file: 'frontend/src/pages/StudentRegisterPage.test.tsx',
        status: 'passed' as const,
        durationMs: 312,
      },
      ...extraCases,
    ];

    const attempt2: TestRunRecord = {
      id: `tr-${workItem.id}-r${revisionNumber}-a2`,
      attemptNumber: revisionNumber > 1 ? 1 : 2,
      runner: 'docker-sandbox / pytest 8.3 (isolated, --network=none)',
      command: 'pytest backend/tests/test_students.py -v --tb=short',
      exitCode: 0,
      passedCount: passedCases.length,
      failedCount: 0,
      durationMs: 1071 + extraCases.length * 164,
      executedAt: nowIso,
      simulated: true,
      cases: passedCases,
      rawOutput: `============================= test session starts ==============================
platform linux -- Python 3.12.7, pytest-8.3.3, asyncio-0.24.0
sandbox: --network=none --read-only --user=1000:1000 (credentials stripped)
collected ${passedCases.length} items

backend/tests/test_students.py::test_create_student_and_search_by_roll_number PASSED
backend/tests/test_students.py::test_search_roll_number_empty_returns_all_sorted PASSED
backend/tests/test_students.py::test_reject_missing_department_returns_422 PASSED
backend/tests/test_students.py::test_create_student_duplicate_roll_number_returns_409 PASSED
frontend/src/pages/StudentRegisterPage.test.tsx::renders_duplicate_alert PASSED${
        revisionNumber > 1
          ? `\nbackend/tests/test_students.py::test_reviewer_revision_whitespace_normalization PASSED`
          : ''
      }
${revisionNumber > 1 && revisionNote ? `\n# Verified reviewer revision request: ${revisionNote}` : ''}
============================== ${passedCases.length} passed in 1.19s (exit code 0) ==============================`,
    };

    return revisionNumber === 1 ? [attempt1, attempt2] : [attempt2];
  }

  return [
    {
      id: `tr-${workItem.id}-r${revisionNumber}-a1`,
      attemptNumber: 1,
      runner: 'docker-sandbox / pytest 8.3 (isolated, --network=none)',
      command: `pytest backend/tests/ -v`,
      exitCode: 0,
      passedCount: 4,
      failedCount: 0,
      durationMs: 920,
      executedAt: nowIso,
      simulated: true,
      cases: [
        {
          id: 'tc-g1',
          name: 'test_endpoint_contract',
          file: `backend/tests/test_${workItem.key.toLowerCase()}.py`,
          status: 'passed',
          durationMs: 210,
        },
        {
          id: 'tc-g2',
          name: 'test_validation_error_payload',
          file: `backend/tests/test_${workItem.key.toLowerCase()}.py`,
          status: 'passed',
          durationMs: 180,
        },
        {
          id: 'tc-g3',
          name: 'test_conflict_guard',
          file: `backend/tests/test_${workItem.key.toLowerCase()}.py`,
          status: 'passed',
          durationMs: 240,
        },
        {
          id: 'tc-g4',
          name: 'FeatureView renders empty and error states',
          file: 'frontend/src/pages/FeatureView.test.tsx',
          status: 'passed',
          durationMs: 290,
        },
      ],
      rawOutput: `============================= test session starts ==============================
sandbox: --network=none --read-only --user=1000:1000
collected 4 items

4 passed in 0.92s (exit code 0)`,
    },
  ];
}

export function buildSimulatedRun(params: {
  project: Project;
  workItem: WorkItem;
  runNumber: number;
  revisionNumber: number;
  prNumber: number;
  revisionNote?: string;
}): DeliveryRun {
  const { project, workItem, runNumber, revisionNumber, prNumber, revisionNote } =
    params;
  const nowIso = new Date().toISOString();
  const commitSha = buildDeterministicSha(
    `${project.repository}:${workItem.key}:run-${runNumber}:rev-${revisionNumber}:${revisionNote || 'initial'}`
  );
  const isStudent = isStudentRegisterRequest(workItem.requestText);
  const changedFiles = isStudent
    ? buildStudentRegisterFiles(revisionNumber, revisionNote)
    : buildGenericFiles(workItem, revisionNumber, revisionNote);
  const testRuns = buildTestRuns(workItem, revisionNumber, nowIso, revisionNote);
  const latestTest = testRuns[testRuns.length - 1];
  const autoCorrections = isStudent && revisionNumber === 1 ? 1 : 0;

  const findings: ReviewFinding[] = isStudent
    ? revisionNumber === 1
      ? [
          {
            id: `rf-${workItem.id}-1`,
            filePath: 'backend/app/routers/students.py',
            line: 35,
            severity: 'suggestion',
            author: 'Code reviewer agent',
            message:
              'Conflict 409 detail returns a plain string; consider returning a structured object with the existing student name and department for registrar clarity.',
            resolved: false,
          },
          {
            id: `rf-${workItem.id}-2`,
            filePath: 'frontend/src/pages/StudentRegisterPage.tsx',
            line: 13,
            severity: 'suggestion',
            author: 'Code reviewer agent',
            message:
              'Add AbortController cleanup in the roll-number search effect so out-of-order responses cannot overwrite newer search results.',
            resolved: false,
          },
        ]
      : [
          {
            id: `rf-${workItem.id}-1`,
            filePath: 'backend/app/routers/students.py',
            line: 39,
            severity: 'note',
            author: 'Code reviewer agent',
            message:
              'Structured 409 Conflict payload and whitespace normalization verified against reviewer feedback.',
            resolved: true,
          },
          {
            id: `rf-${workItem.id}-2`,
            filePath: 'frontend/src/pages/StudentRegisterPage.tsx',
            line: 15,
            severity: 'note',
            author: 'Code reviewer agent',
            message:
              'AbortController guard and client-side trim/uppercase normalization confirmed.',
            resolved: true,
          },
        ]
    : [
        {
          id: `rf-${workItem.id}-1`,
          filePath: changedFiles[0].path,
          line: 10,
          severity: 'note',
          author: 'Code reviewer agent',
          message: 'Contract matches approved acceptance criteria with no blocking issues.',
          resolved: true,
        },
      ];

  const steps: AgentStep[] = [
    {
      id: `step-${runNumber}-1`,
      role: 'requirements_analyst',
      label: 'Requirements analyst',
      stageOrder: 1,
      status: 'completed',
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: 840,
      inputsSummary: `Work item ${workItem.key} request (${workItem.requestText.length} chars) + ${workItem.acceptanceCriteria.length} approved criteria`,
      outputsSummary: `${workItem.acceptanceCriteria.length} acceptance criteria locked; ${workItem.missingInfoFlags.length} assumptions documented`,
      artifact: {
        kind: 'requirements',
        title: 'Approved Acceptance Criteria & Clarifications',
        summary: `Locked ${workItem.acceptanceCriteria.length} verifiable acceptance criteria after plan approval.`,
        content: [
          `Request:\n${workItem.requestText}`,
          '',
          'Acceptance Criteria:',
          ...workItem.acceptanceCriteria.map(
            (c, i) => `${i + 1}. [${c.category}] ${c.text}`
          ),
          '',
          'Flagged Assumptions:',
          ...workItem.missingInfoFlags.map(
            (f) => `- ${f.question}\n  Resolution: ${f.resolution || 'Confirmed in plan approval'}`
          ),
        ].join('\n'),
        structuredMeta: {
          WorkItem: workItem.key,
          CriteriaCount: String(workItem.acceptanceCriteria.length),
          PlanApproved: 'Yes',
        },
      },
    },
    {
      id: `step-${runNumber}-2`,
      role: 'architect',
      label: 'Architect',
      stageOrder: 2,
      status: 'completed',
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: 1420,
      inputsSummary: `Repository snapshot ${project.repository}@${project.defaultBranch} + approved criteria`,
      outputsSummary: isStudent
        ? 'Defined Student SQLAlchemy model, unique upper(roll_number) index, and /api/students OpenAPI contract'
        : `Defined data model, FastAPI contract, and ${changedFiles.length}-file change plan`,
      artifact: {
        kind: 'architecture',
        title: 'Data Model, API Contract & Change Plan',
        summary: isStudent
          ? 'Shared contract consumed in parallel by Python engineer and React engineer.'
          : 'Contract and file plan produced from repository inspection.',
        content: isStudent
          ? JSON.stringify(
              {
                table: 'students',
                columns: {
                  id: 'SERIAL PRIMARY KEY',
                  roll_number: 'VARCHAR(32) NOT NULL UNIQUE',
                  full_name: 'VARCHAR(140) NOT NULL',
                  department: 'VARCHAR(100) NOT NULL',
                  created_at: 'TIMESTAMPTZ NOT NULL DEFAULT now()',
                },
                indexes: [
                  'CREATE UNIQUE INDEX uq_students_roll_number_upper ON students (UPPER(roll_number))',
                ],
                endpoints: [
                  {
                    method: 'GET',
                    path: '/api/students?roll_number=<prefix>',
                    response: '{ items: StudentOut[], total: number }',
                  },
                  {
                    method: 'POST',
                    path: '/api/students',
                    body: '{ roll_number: string, full_name: string, department: string }',
                    responses: {
                      201: 'StudentOut',
                      409: 'Duplicate roll number conflict detail',
                      422: 'Validation error',
                    },
                  },
                ],
                parallelTracks: {
                  python_engineer: [
                    'backend/app/models/student.py',
                    'backend/app/routers/students.py',
                  ],
                  react_engineer: ['frontend/src/pages/StudentRegisterPage.tsx'],
                },
              },
              null,
              2
            )
          : JSON.stringify(
              {
                repository: project.repository,
                branch: `calder/${workItem.key.toLowerCase()}`,
                plannedFiles: changedFiles.map((f) => f.path),
              },
              null,
              2
            ),
        structuredMeta: {
          Repository: project.repository,
          BaseBranch: project.defaultBranch,
          PlannedFiles: String(changedFiles.length),
        },
      },
    },
    {
      id: `step-${runNumber}-3`,
      role: 'python_engineer',
      label: 'Python engineer',
      stageOrder: 3,
      parallelGroup: 'implementation',
      status: 'completed',
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: 2180,
      inputsSummary: 'API contract + SQLAlchemy schema plan (parallel branch A)',
      outputsSummary: `Generated ${changedFiles.filter((f) => f.layer === 'backend').length} backend Python files against contract`,
      artifact: {
        kind: 'code_changes',
        title: 'FastAPI Backend Implementation',
        summary: revisionNote
          ? `Updated FastAPI backend for revision ${revisionNumber}: ${revisionNote}`
          : 'Implemented FastAPI endpoints, SQLAlchemy model, and IntegrityError -> HTTP 409 handling.',
        content: changedFiles
          .filter((f) => f.layer === 'backend')
          .map((f) => f.diff)
          .join('\n\n'),
        structuredMeta: {
          ParallelTrack: 'Branch A (concurrent with React engineer)',
          FilesModified: String(changedFiles.filter((f) => f.layer === 'backend').length),
          CommitSHA: shortSha(commitSha),
        },
      },
    },
    {
      id: `step-${runNumber}-4`,
      role: 'react_engineer',
      label: 'React engineer',
      stageOrder: 3,
      parallelGroup: 'implementation',
      status: 'completed',
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: 1960,
      inputsSummary: 'API contract + TypeScript types (parallel branch B)',
      outputsSummary: `Generated ${changedFiles.filter((f) => f.layer === 'frontend').length} React TypeScript UI file against contract`,
      artifact: {
        kind: 'code_changes',
        title: 'React + TypeScript Interface Implementation',
        summary: revisionNote
          ? `Updated React UI for revision ${revisionNumber}: ${revisionNote}`
          : 'Built student register form, roll-number search input, and accessible alert banner.',
        content: changedFiles
          .filter((f) => f.layer === 'frontend')
          .map((f) => f.diff)
          .join('\n\n'),
        structuredMeta: {
          ParallelTrack: 'Branch B (concurrent with Python engineer)',
          FilesModified: String(changedFiles.filter((f) => f.layer === 'frontend').length),
          CommitSHA: shortSha(commitSha),
        },
      },
    },
    {
      id: `step-${runNumber}-5`,
      role: 'test_engineer',
      label: 'Test engineer',
      stageOrder: 4,
      status: 'completed',
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: latestTest.durationMs,
      inputsSummary: 'Combined backend + frontend workspace inside isolated sandbox',
      outputsSummary: `Exit code ${latestTest.exitCode} · ${latestTest.passedCount} passed, ${latestTest.failedCount} failed (includes duplicate roll number test)`,
      artifact: {
        kind: 'test_report',
        title: 'Isolated Test Runner Output',
        summary: `${latestTest.runner} exited with code ${latestTest.exitCode}.`,
        content: latestTest.rawOutput,
        structuredMeta: {
          ExitCode: String(latestTest.exitCode),
          Passed: String(latestTest.passedCount),
          Failed: String(latestTest.failedCount),
          SandboxIsolation: '--network=none, credentials stripped',
        },
      },
    },
    {
      id: `step-${runNumber}-6`,
      role: 'bug_detection_agent',
      label: 'Bug detection agent',
      stageOrder: 5,
      status: autoCorrections > 0 ? 'completed' : 'skipped',
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: autoCorrections > 0 ? 1120 : 0,
      inputsSummary:
        autoCorrections > 0
          ? 'Attempt 1 pytest failure traceback (exit code 1)'
          : 'Latest test run exited with code 0; no automatic correction required',
      outputsSummary:
        autoCorrections > 0
          ? 'Auto-correction 1/2: routed IntegrityError 409 guard to Python engineer; re-test passed'
          : 'Skipped — all tests passed on first run',
      artifact: {
        kind: 'bug_report',
        title:
          autoCorrections > 0
            ? 'Auto-Correction Attempt 1 of 2 (Resolved)'
            : 'No Failures Detected',
        summary:
          autoCorrections > 0
            ? 'Detected case-insensitive duplicate roll number IntegrityError returning 500 instead of 409.'
            : 'Test runner returned exit code 0 on the current revision.',
        content:
          autoCorrections > 0
            ? [
                'Failure Observed (Attempt 1, exit code 1):',
                '  test_create_student_duplicate_roll_number_returns_409 expected HTTP 409, received HTTP 500.',
                '  Root cause: lowercase "ee-2026-008" bypassed exact string match and triggered PostgreSQL unique index IntegrityError.',
                '',
                'Focused Correction Request -> Python engineer:',
                '  1. Normalize roll_number with strip().upper() before lookup and insert.',
                '  2. Catch sqlalchemy.exc.IntegrityError, roll back session, and return HTTP 409 Conflict.',
                '',
                'Verification (Attempt 2, exit code 0):',
                '  All 5 tests passed. Within 2-attempt automatic retry budget.',
              ].join('\n')
            : 'No failing tests were reported by the isolated sandbox runner.',
        structuredMeta: {
          CorrectionAttempts: `${autoCorrections} / ${MAX_AUTO_CORRECTION_ATTEMPTS}`,
          ResponsibleAgent: autoCorrections > 0 ? 'Python engineer' : 'None',
          Outcome: autoCorrections > 0 ? 'Resolved on retry' : 'Clean pass',
        },
      },
    },
    {
      id: `step-${runNumber}-7`,
      role: 'code_reviewer',
      label: 'Code reviewer',
      stageOrder: 6,
      status: 'completed',
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: 1290,
      inputsSummary: `Combined diff (${changedFiles.length} files) + ${workItem.acceptanceCriteria.length} acceptance criteria`,
      outputsSummary: `${findings.length} file-pinned review notes recorded (${findings.filter((f) => !f.resolved).length} open)`,
      artifact: {
        kind: 'code_review',
        title: 'Automated Code Review Findings',
        summary: `Checked all ${changedFiles.length} changed files against acceptance criteria and security checklist.`,
        content: findings
          .map(
            (f) =>
              `[${f.severity.toUpperCase()}] ${f.filePath}:${f.line} (${f.resolved ? 'resolved' : 'open'})\n  ${f.message}`
          )
          .join('\n\n'),
        structuredMeta: {
          FilesReviewed: String(changedFiles.length),
          Blockers: String(findings.filter((f) => f.severity === 'blocker' && !f.resolved).length),
          CommitSHA: shortSha(commitSha),
        },
      },
    },
    {
      id: `step-${runNumber}-8`,
      role: 'documentation_writer',
      label: 'Documentation writer',
      stageOrder: 7,
      status: 'completed',
      startedAt: nowIso,
      completedAt: nowIso,
      durationMs: 760,
      inputsSummary: `Final passing revision ${shortSha(commitSha)} + API contract`,
      outputsSummary: 'Generated setup commands, migration note, and pull request summary',
      artifact: {
        kind: 'documentation',
        title: 'Change Summary & Local Setup Instructions',
        summary: `Summarized revision ${shortSha(commitSha)} for reviewer handoff and client release notes.`,
        content: [
          `# ${workItem.key}: ${workItem.title}`,
          '',
          `Revision: ${commitSha}`,
          `Simulated in Demo workspace: Yes`,
          '',
          '## Summary of changes',
          ...changedFiles.map(
            (f) => `- \`${f.path}\` (+${f.additions} / -${f.deletions})`
          ),
          '',
          '## Local verification commands',
          '```bash',
          'alembic upgrade head',
          'pytest backend/tests/ -v',
          '```',
          revisionNote ? `\n## Revision ${revisionNumber} response\n- ${revisionNote}` : '',
        ].join('\n'),
        structuredMeta: {
          Revision: `rev-${revisionNumber} (${shortSha(commitSha)})`,
          TargetBranch: `calder/${workItem.key.toLowerCase()}-rev-${revisionNumber}`,
        },
      },
    },
  ];

  const branchSlug = workItem.key.toLowerCase().replace(/[^a-z0-9-]/g, '');

  return {
    id: `run-${workItem.id}-${runNumber}`,
    workItemId: workItem.id,
    runNumber,
    revisionNumber,
    commitSha,
    status: 'needs_review',
    simulated: true,
    createdAt: nowIso,
    updatedAt: nowIso,
    autoCorrectionAttempts: autoCorrections,
    maxAutoCorrectionAttempts: MAX_AUTO_CORRECTION_ATTEMPTS,
    steps,
    changedFiles,
    testRuns,
    findings,
    reviewHistory: [],
    pullRequest: {
      number: prNumber,
      title: `${workItem.key}: ${workItem.title}`,
      branchName: `calder/${branchSlug}`,
      baseBranch: project.defaultBranch,
      url: `https://github.com/${project.repository}/pull/${prNumber}`,
      isDraft: false,
      headSha: commitSha,
      approvedSha: null,
      approvedBy: null,
      approvedAt: null,
      status: 'open',
      mergeCommitSha: null,
      mergedBy: null,
      mergedAt: null,
      simulated: true,
    },
  };
}

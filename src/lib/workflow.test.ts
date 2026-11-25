import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyNewRevisionCommit,
  buildDeterministicSha,
  evaluateCorrectionLoop,
  evaluateMergeGate,
  isApprovalValidForRevision,
  parseUnifiedDiff,
  validateProjectInput,
  validateWorkItemInput,
} from './workflow';
import type { DeliveryRun, PullRequestRecord } from '../types/calder';

function makePr(overrides: Partial<PullRequestRecord> = {}): PullRequestRecord {
  return {
    number: 42,
    title: 'Add student register endpoints and UI',
    branchName: 'calder/cw-109-student-register',
    baseBranch: 'main',
    url: 'https://github.com/calder-clients/campus-operations/pull/42',
    isDraft: false,
    headSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    approvedSha: null,
    approvedBy: null,
    approvedAt: null,
    status: 'open',
    mergeCommitSha: null,
    mergedBy: null,
    mergedAt: null,
    simulated: true,
    ...overrides,
  };
}

function makeRun(overrides: Partial<DeliveryRun> = {}): DeliveryRun {
  const headSha = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  return {
    id: 'run-1',
    workItemId: 'wi-1',
    runNumber: 1,
    revisionNumber: 1,
    commitSha: headSha,
    status: 'needs_review',
    simulated: true,
    createdAt: '2026-11-25T09:00:00Z',
    updatedAt: '2026-11-25T09:05:00Z',
    autoCorrectionAttempts: 1,
    maxAutoCorrectionAttempts: 2,
    steps: [],
    changedFiles: [],
    testRuns: [
      {
        id: 'tr-1',
        attemptNumber: 2,
        runner: 'docker-sandbox/pytest',
        command: 'pytest -v',
        exitCode: 0,
        passedCount: 6,
        failedCount: 0,
        durationMs: 1240,
        executedAt: '2026-11-25T09:04:00Z',
        simulated: true,
        cases: [],
        rawOutput: '6 passed',
      },
    ],
    findings: [],
    reviewHistory: [],
    pullRequest: makePr({ headSha }),
    ...overrides,
  };
}

test('SHA-bound approval matches exact commit and invalidates on new commit', () => {
  const sha1 = buildDeterministicSha('rev-1');
  const sha2 = buildDeterministicSha('rev-2');
  assert.notEqual(sha1, sha2);
  assert.equal(sha1.length, 40);

  const approvedPr = makePr({
    headSha: sha1,
    approvedSha: sha1,
    approvedBy: 'Priya Nair',
    approvedAt: '2026-11-25T09:10:00Z',
  });

  assert.equal(isApprovalValidForRevision(approvedPr, sha1), true);
  assert.equal(isApprovalValidForRevision(approvedPr, sha2), false);

  const { updatedPr, invalidationRecord } = applyNewRevisionCommit(
    approvedPr,
    sha2,
    '2026-11-25T09:15:00Z'
  );
  assert.equal(updatedPr.headSha, sha2);
  assert.equal(updatedPr.approvedSha, null);
  assert.equal(updatedPr.approvedBy, null);
  assert.ok(invalidationRecord);
  assert.equal(invalidationRecord?.action, 'approval_invalidated');
  assert.equal(isApprovalValidForRevision(updatedPr, sha2), false);
});

test('merge gate requires passing checks AND exact SHA approval', () => {
  const run = makeRun();
  const blocked = evaluateMergeGate(run);
  assert.equal(blocked.canMerge, false);
  assert.equal(blocked.checksPassed, true);
  assert.equal(blocked.approvedForCurrentSha, false);

  const approvedRun = makeRun({
    status: 'approved',
    pullRequest: makePr({
      headSha: run.commitSha,
      approvedSha: run.commitSha,
      approvedBy: 'Priya Nair',
      approvedAt: '2026-11-25T09:12:00Z',
    }),
  });
  const allowed = evaluateMergeGate(approvedRun);
  assert.equal(allowed.canMerge, true);
  assert.equal(allowed.reasons.length, 0);

  const failedTestsRun = makeRun({
    status: 'approved',
    testRuns: [
      {
        ...run.testRuns[0],
        exitCode: 1,
        failedCount: 1,
      },
    ],
    pullRequest: makePr({
      headSha: run.commitSha,
      approvedSha: run.commitSha,
      approvedBy: 'Priya Nair',
    }),
  });
  const blockedByTests = evaluateMergeGate(failedTestsRun);
  assert.equal(blockedByTests.canMerge, false);
  assert.equal(blockedByTests.checksPassed, false);
});

test('auto-correction loop allows up to 2 attempts then pauses for human decision', () => {
  assert.equal(evaluateCorrectionLoop(0, 0, 2), 'pass');
  assert.equal(evaluateCorrectionLoop(1, 0, 2), 'auto_retry');
  assert.equal(evaluateCorrectionLoop(1, 1, 2), 'auto_retry');
  assert.equal(evaluateCorrectionLoop(1, 2, 2), 'pause_for_human');
});

test('unified diff parser tracks old and new line numbers accurately', () => {
  const diff = [
    '--- a/app/routers/students.py',
    '+++ b/app/routers/students.py',
    '@@ -10,3 +10,4 @@',
    ' def create_student(payload: StudentCreate):',
    '-    roll = payload.roll_number',
    '+    roll = payload.roll_number.strip().upper()',
    '+    if repo.exists(roll): raise HTTPException(409)',
    '     return repo.save(roll)',
  ].join('\n');

  const lines = parseUnifiedDiff(diff);
  const delLine = lines.find((l) => l.type === 'del');
  const addLines = lines.filter((l) => l.type === 'add');
  assert.equal(delLine?.oldLineNumber, 11);
  assert.equal(delLine?.newLineNumber, null);
  assert.equal(addLines.length, 2);
  assert.equal(addLines[0].newLineNumber, 11);
  assert.equal(addLines[1].newLineNumber, 12);
});

test('project and work item validation rejects malformed inputs', () => {
  assert.ok(
    validateProjectInput({
      name: 'Campus',
      clientName: 'St Jude',
      repository: 'invalid-repo-name',
      defaultBranch: 'main',
    })
  );
  assert.equal(
    validateProjectInput({
      name: 'Campus Operations',
      clientName: 'St. Jude College',
      repository: 'calder-clients/campus-operations',
      defaultBranch: 'main',
    }),
    null
  );
  assert.ok(validateWorkItemInput({ projectId: 'p1', requestText: 'too short' }));
  assert.equal(
    validateWorkItemInput({
      projectId: 'p1',
      requestText: 'Give the college administrator a student register.',
    }),
    null
  );
});

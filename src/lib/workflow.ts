import type {
  DeliveryRun,
  ParsedDiffLine,
  PullRequestRecord,
  ReviewDecisionRecord,
  TestRunRecord,
} from '../types/calder';

export const MAX_AUTO_CORRECTION_ATTEMPTS = 2;

export function shortSha(sha: string | null | undefined): string {
  if (!sha) return '-------';
  return sha.slice(0, 7);
}

/**
 * Generates a deterministic 40-character hexadecimal SHA for simulated demo commits.
 */
export function buildDeterministicSha(seed: string): string {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const parts: string[] = [];
  let stateA = h1 >>> 0;
  let stateB = h2 >>> 0;
  for (let i = 0; i < 5; i += 1) {
    stateA = Math.imul(stateA ^ (stateA >>> 16), 2246822507) >>> 0;
    stateB = Math.imul(stateB ^ (stateB >>> 13), 3266489909) >>> 0;
    parts.push(((stateA ^ stateB) >>> 0).toString(16).padStart(8, '0'));
  }
  return parts.join('').slice(0, 40);
}

/**
 * Checks whether reviewer approval is bound to the exact current commit SHA.
 * Any new commit invalidates prior approvals.
 */
export function isApprovalValidForRevision(
  pr: PullRequestRecord | null,
  currentCommitSha: string
): boolean {
  if (!pr || !currentCommitSha) return false;
  return Boolean(
    pr.approvedSha &&
      pr.approvedBy &&
      pr.approvedSha === currentCommitSha &&
      pr.headSha === currentCommitSha
  );
}

export function getLatestTestRun(run: DeliveryRun): TestRunRecord | null {
  if (!run.testRuns.length) return null;
  return run.testRuns[run.testRuns.length - 1];
}

export interface MergeGateStatus {
  canMerge: boolean;
  checksPassed: boolean;
  approvedForCurrentSha: boolean;
  notAlreadyMerged: boolean;
  notPausedOrFailed: boolean;
  reasons: string[];
}

/**
 * Enforces merge policy:
 * 1. Latest test runner exit code must be 0.
 * 2. Reviewer approval must match the exact current commit SHA.
 * 3. Run must not be paused or failed.
 * 4. PR must still be open.
 */
export function evaluateMergeGate(run: DeliveryRun): MergeGateStatus {
  const pr = run.pullRequest;
  const latestTest = getLatestTestRun(run);
  const checksPassed = Boolean(
    latestTest && latestTest.exitCode === 0 && latestTest.failedCount === 0
  );
  const approvedForCurrentSha = isApprovalValidForRevision(pr, run.commitSha);
  const notAlreadyMerged = Boolean(pr && pr.status === 'open');
  const notPausedOrFailed =
    run.status !== 'paused_human_decision' && run.status !== 'failed';

  const reasons: string[] = [];
  if (!pr) {
    reasons.push('No pull request has been opened for this run.');
  } else if (pr.status === 'merged') {
    reasons.push('Pull request is already merged.');
  }
  if (!checksPassed) {
    reasons.push('Required test suite has not passed on the current revision.');
  }
  if (!approvedForCurrentSha) {
    if (pr?.approvedSha && pr.approvedSha !== run.commitSha) {
      reasons.push(
        `Previous approval for ${shortSha(pr.approvedSha)} was invalidated by commit ${shortSha(run.commitSha)}.`
      );
    } else {
      reasons.push(
        `Explicit reviewer approval is required for revision ${shortSha(run.commitSha)}.`
      );
    }
  }
  if (!notPausedOrFailed) {
    reasons.push('Run is paused waiting for a human engineering decision.');
  }

  return {
    canMerge:
      checksPassed &&
      approvedForCurrentSha &&
      notAlreadyMerged &&
      notPausedOrFailed,
    checksPassed,
    approvedForCurrentSha,
    notAlreadyMerged,
    notPausedOrFailed,
    reasons,
  };
}

/**
 * Applies a new commit SHA to a pull request and invalidates any existing approval.
 */
export function applyNewRevisionCommit(
  pr: PullRequestRecord,
  newCommitSha: string,
  timestampIso: string
): {
  updatedPr: PullRequestRecord;
  invalidationRecord: ReviewDecisionRecord | null;
} {
  let invalidationRecord: ReviewDecisionRecord | null = null;

  if (pr.approvedSha && pr.approvedSha !== newCommitSha) {
    invalidationRecord = {
      id: `rev-inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'approval_invalidated',
      reviewer: pr.approvedBy ?? 'System',
      commitSha: newCommitSha,
      comment: `Approval bound to ${shortSha(pr.approvedSha)} was automatically invalidated when revision ${shortSha(newCommitSha)} was pushed.`,
      createdAt: timestampIso,
      simulated: pr.simulated,
    };
  }

  return {
    updatedPr: {
      ...pr,
      headSha: newCommitSha,
      approvedSha: null,
      approvedBy: null,
      approvedAt: null,
      isDraft: false,
    },
    invalidationRecord,
  };
}

/**
 * Evaluates LangGraph bug-detection loop termination.
 * Allows up to `maxAttempts` (default 2) automatic correction attempts before pausing for a human decision.
 */
export function evaluateCorrectionLoop(
  exitCode: number,
  attemptsCompleted: number,
  maxAttempts: number = MAX_AUTO_CORRECTION_ATTEMPTS
): 'pass' | 'auto_retry' | 'pause_for_human' {
  if (exitCode === 0) return 'pass';
  if (attemptsCompleted < maxAttempts) return 'auto_retry';
  return 'pause_for_human';
}

/**
 * Parses a unified diff into typed lines with old/new line numbers.
 */
export function parseUnifiedDiff(diffText: string): ParsedDiffLine[] {
  const rawLines = diffText.replace(/\r\n/g, '\n').split('\n');
  const result: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of rawLines) {
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode')
    ) {
      result.push({
        type: 'meta',
        content: line,
        oldLineNumber: null,
        newLineNumber: null,
      });
      continue;
    }

    if (line.startsWith('@@')) {
      const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (match) {
        oldLine = Number.parseInt(match[1], 10);
        newLine = Number.parseInt(match[2], 10);
      }
      result.push({
        type: 'hunk',
        content: line,
        oldLineNumber: null,
        newLineNumber: null,
      });
      continue;
    }

    if (line.startsWith('+')) {
      result.push({
        type: 'add',
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine,
      });
      newLine += 1;
      continue;
    }

    if (line.startsWith('-')) {
      result.push({
        type: 'del',
        content: line.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: null,
      });
      oldLine += 1;
      continue;
    }

    const content = line.startsWith(' ') ? line.slice(1) : line;
    result.push({
      type: 'context',
      content,
      oldLineNumber: oldLine > 0 ? oldLine : null,
      newLineNumber: newLine > 0 ? newLine : null,
    });
    if (oldLine > 0) oldLine += 1;
    if (newLine > 0) newLine += 1;
  }

  return result;
}

export function validateProjectInput(input: {
  name: string;
  clientName: string;
  repository: string;
  defaultBranch: string;
}): string | null {
  if (!input.name.trim()) return 'Project name is required.';
  if (!input.clientName.trim()) return 'Client name is required.';
  const repo = input.repository.trim();
  if (!repo || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
    return 'Repository must follow owner/repo format (for example, calder-clients/campus-operations).';
  }
  if (!input.defaultBranch.trim()) return 'Default branch is required.';
  return null;
}

export function validateWorkItemInput(input: {
  projectId: string;
  title?: string;
  requestText: string;
}): string | null {
  if (!input.projectId.trim()) return 'Select a project first.';
  if (input.requestText.trim().length < 12) {
    return 'Describe the requested feature in at least 12 characters.';
  }
  return null;
}

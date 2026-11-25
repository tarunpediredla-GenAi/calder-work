import { FormEvent, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  GitMerge,
  GitPullRequest,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  evaluateMergeGate,
  getLatestTestRun,
  parseUnifiedDiff,
  shortSha,
} from '../lib/workflow';
import type {
  ConnectionState,
  DeliveryRun,
  Project,
  WorkItem,
} from '../types/calder';
import { formatShortDate, WorkStatusText } from './StatusLabel';

interface ReviewViewProps {
  project: Project | null;
  workItem: WorkItem | null;
  run: DeliveryRun | null;
  reviewers: string[];
  connection: ConnectionState;
  onRequestChanges: (
    runId: string,
    payload: { comment: string; reviewer: string }
  ) => Promise<void>;
  onApproveRevision: (
    runId: string,
    payload: { reviewer: string; commitSha: string; comment?: string }
  ) => Promise<void>;
  onMergePullRequest: (
    runId: string,
    payload: { confirmed: boolean; confirmedBy: string; commitSha: string }
  ) => Promise<void>;
  onRunGeminiDiffReview: (runId: string) => Promise<string>;
  onOpenRunDetails: () => void;
}

export function ReviewView({
  project,
  workItem,
  run,
  reviewers,
  connection,
  onRequestChanges,
  onApproveRevision,
  onMergePullRequest,
  onRunGeminiDiffReview,
  onOpenRunDetails,
}: ReviewViewProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [selectedTestAttemptIdx, setSelectedTestAttemptIdx] =
    useState<number>(0);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const [activeReviewer, setActiveReviewer] = useState(
    workItem?.assignedReviewer || reviewers[0] || 'Priya Nair'
  );

  // Request changes form state
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeComment, setChangeComment] = useState('');
  const [submittingChanges, setSubmittingChanges] = useState(false);

  // Approve revision state
  const [approving, setApproving] = useState(false);

  // Separate explicit merge confirmation state
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [merging, setMerging] = useState(false);

  // Optional Gemini live diff check
  const [runningGeminiReview, setRunningGeminiReview] = useState(false);

  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (workItem?.assignedReviewer) {
      setActiveReviewer(workItem.assignedReviewer);
    }
  }, [workItem?.assignedReviewer]);

  useEffect(() => {
    if (!run) return;
    if (
      !selectedFilePath ||
      !run.changedFiles.some((f) => f.path === selectedFilePath)
    ) {
      setSelectedFilePath(run.changedFiles[0]?.path || '');
    }
    setSelectedTestAttemptIdx(Math.max(0, run.testRuns.length - 1));
    setShowMergeConfirm(false);
  }, [run?.id, run?.commitSha, run?.testRuns.length]);

  if (!run || !workItem) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="rounded border border-[#E5E1D8] bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-[#1A1C1E]">
            No revision ready for review
          </h1>
          <p className="mt-1 text-sm text-[#5C6066]">
            Select a work item with a completed delivery run to inspect changed
            files, diffs, and test results.
          </p>
        </div>
      </div>
    );
  }

  const activeFile =
    run.changedFiles.find((f) => f.path === selectedFilePath) ??
    run.changedFiles[0] ??
    null;
  const parsedLines = activeFile ? parseUnifiedDiff(activeFile.diff) : [];
  const fileFindings = activeFile
    ? run.findings.filter((f) => f.filePath === activeFile.path)
    : [];
  const displayedTestRun =
    run.testRuns[selectedTestAttemptIdx] ?? getLatestTestRun(run);
  const mergeGate = evaluateMergeGate(run);
  const pr = run.pullRequest;

  async function handleRequestChangesSubmit(event: FormEvent) {
    event.preventDefault();
    if (!run) return;
    setActionError(null);
    setActionNotice(null);
    if (changeComment.trim().length < 6) {
      setActionError(
        'Enter specific feedback (at least 6 characters) before requesting changes.'
      );
      return;
    }
    setSubmittingChanges(true);
    try {
      await onRequestChanges(run.id, {
        comment: changeComment.trim(),
        reviewer: activeReviewer,
      });
      setChangeComment('');
      setShowChangeForm(false);
      setActionNotice(
        'Changes requested — a new revision commit SHA was generated and any prior approval was invalidated.'
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to request changes.'
      );
    } finally {
      setSubmittingChanges(false);
    }
  }

  async function handleApproveRevisionClick() {
    if (!run) return;
    setActionError(null);
    setActionNotice(null);
    setApproving(true);
    try {
      await onApproveRevision(run.id, {
        reviewer: activeReviewer,
        commitSha: run.commitSha,
      });
      setActionNotice(
        `Revision ${shortSha(run.commitSha)} approved by ${activeReviewer}. Merge is now unlocked below.`
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to approve revision.'
      );
    } finally {
      setApproving(false);
    }
  }

  async function handleConfirmMerge() {
    if (!run) return;
    setActionError(null);
    setActionNotice(null);
    setMerging(true);
    try {
      await onMergePullRequest(run.id, {
        confirmed: true,
        confirmedBy: activeReviewer,
        commitSha: run.commitSha,
      });
      setShowMergeConfirm(false);
      setActionNotice(
        `Pull request #${pr?.number} merged at revision ${shortSha(run.commitSha)}.`
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Merge failed.');
    } finally {
      setMerging(false);
    }
  }

  async function handleGeminiDiffCheck() {
    if (!run) return;
    setActionError(null);
    setActionNotice(null);
    setRunningGeminiReview(true);
    try {
      const model = await onRunGeminiDiffReview(run.id);
      setActionNotice(`Additional code review notes generated by ${model}.`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gemini diff check failed.'
      );
    } finally {
      setRunningGeminiReview(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1520px] space-y-5 p-4 lg:p-6">
      {/* Header strip */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5E1D8] pb-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C6066]">
            <span className="font-mono font-semibold text-[#1A1C1E]">
              {workItem.key}
            </span>
            <span aria-hidden="true">·</span>
            <WorkStatusText status={run.status} />
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[#1A1C1E]">
              rev-{run.revisionNumber} ({shortSha(run.commitSha)})
            </span>
            {pr && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">
                  PR #{pr.number} ({pr.branchName} → {pr.baseBranch})
                </span>
              </>
            )}
            {run.simulated && (
              <>
                <span aria-hidden="true">·</span>
                <span>Demo workspace (simulated)</span>
              </>
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[#1A1C1E]">
            {workItem.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="review-acting-reviewer"
              className="text-xs text-[#5C6066] whitespace-nowrap"
            >
              Reviewer
            </label>
            <select
              id="review-acting-reviewer"
              value={activeReviewer}
              onChange={(e) => setActiveReviewer(e.target.value)}
              className="rounded border border-[#D4CFC4] bg-white px-2.5 py-1.5 text-xs text-[#1A1C1E]"
            >
              {reviewers.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenRunDetails}
            className="rounded border border-[#D4CFC4] bg-white px-3 py-1.5 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC] whitespace-nowrap"
          >
            Run details
          </button>

          {run.changedFiles.length > 0 && pr?.status === 'open' && (
            <button
              type="button"
              disabled={runningGeminiReview}
              onClick={handleGeminiDiffCheck}
              className="inline-flex items-center gap-1.5 rounded border border-[#D4CFC4] bg-white px-3 py-1.5 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC] disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  runningGeminiReview ? 'animate-spin' : ''
                }`}
                aria-hidden="true"
              />
              <span>
                {runningGeminiReview ? 'Checking...' : 'Gemini diff check'}
              </span>
            </button>
          )}

          {pr?.status === 'open' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setShowChangeForm((v) => !v);
                  setActionError(null);
                }}
                className="rounded border border-[#B45309] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#92400E] hover:bg-[#FFFBEB] whitespace-nowrap"
              >
                Request changes
              </button>

              <button
                type="button"
                disabled={
                  approving ||
                  !mergeGate.checksPassed ||
                  mergeGate.approvedForCurrentSha
                }
                onClick={handleApproveRevisionClick}
                className="inline-flex items-center gap-1.5 rounded bg-[#1E40AF] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1E3A8A] disabled:opacity-50 whitespace-nowrap"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {approving
                    ? 'Approving...'
                    : mergeGate.approvedForCurrentSha
                    ? `Approved (${shortSha(run.commitSha)})`
                    : `Approve revision (${shortSha(run.commitSha)})`}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]"
        >
          {actionError}
        </div>
      )}

      {actionNotice && (
        <div
          role="status"
          className="rounded border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]"
        >
          {actionNotice}
        </div>
      )}

      {showChangeForm && pr?.status === 'open' && (
        <form
          onSubmit={handleRequestChangesSubmit}
          className="rounded border border-[#F59E0B] bg-[#FFFDF7] p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="request-changes-input"
              className="text-xs font-semibold text-[#1A1C1E]"
            >
              Request revision on commit{' '}
              <span className="font-mono">{shortSha(run.commitSha)}</span>
            </label>
            <span className="text-xs text-[#5C6066]">
              Pushing a new revision automatically invalidates any prior
              approval.
            </span>
          </div>
          <textarea
            id="request-changes-input"
            rows={2}
            value={changeComment}
            onChange={(e) => setChangeComment(e.target.value)}
            placeholder="Describe required backend, frontend, or test changes (e.g. Return structured 409 detail with existing student name and normalize whitespace)..."
            className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowChangeForm(false)}
              className="rounded border border-[#D4CFC4] bg-white px-3 py-1.5 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingChanges}
              className="rounded bg-[#B45309] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#92400E] disabled:opacity-50 whitespace-nowrap"
            >
              {submittingChanges
                ? 'Running revision...'
                : 'Submit change request (Simulated)'}
            </button>
          </div>
        </form>
      )}

      {/* Three-column engineering review layout: Changed files | Unified Diff | Test results */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 xl:grid-cols-[248px_minmax(0,1fr)_336px]">
        {/* Left: Changed files */}
        <section
          aria-labelledby="changed-files-heading"
          className="rounded border border-[#E5E1D8] bg-white lg:col-span-3 xl:col-span-1"
        >
          <div className="flex items-center justify-between border-b border-[#E5E1D8] px-4 py-3">
            <h2
              id="changed-files-heading"
              className="text-xs font-semibold text-[#1A1C1E]"
            >
              Changed files
            </h2>
            <span className="font-mono text-xs text-[#5C6066] tabular-nums">
              {run.changedFiles.length}
            </span>
          </div>

          {run.changedFiles.length === 0 ? (
            <p className="p-4 text-xs text-[#5C6066]">
              No diff files stored for this historical run.
            </p>
          ) : (
            <ul className="divide-y divide-[#ECE9E1]">
              {run.changedFiles.map((file) => {
                const isSelected = activeFile?.path === file.path;
                const openCount = run.findings.filter(
                  (f) => f.filePath === file.path && !f.resolved
                ).length;
                const lastSlash = file.path.lastIndexOf('/');
                const dirPart =
                  lastSlash >= 0 ? file.path.slice(0, lastSlash + 1) : '';
                const fileName =
                  lastSlash >= 0 ? file.path.slice(lastSlash + 1) : file.path;

                return (
                  <li key={file.path}>
                    <button
                      type="button"
                      onClick={() => setSelectedFilePath(file.path)}
                      aria-current={isSelected ? 'true' : undefined}
                      aria-label={file.path}
                      className={`w-full px-3.5 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-[#F3F6FC] text-[#1E3A8A]'
                          : 'hover:bg-[#FAF9F6] text-[#1A1C1E]'
                      }`}
                    >
                      {dirPart && (
                        <div className="truncate font-mono text-[11px] text-[#5C6066]">
                          {dirPart}
                        </div>
                      )}
                      <div className="break-words font-mono text-xs font-semibold">
                        {fileName}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-[#5C6066] tabular-nums">
                        <span>
                          {file.layer} · {file.changeType}
                        </span>
                        <span className="font-mono">
                          <span className="text-[#15803D]">
                            +{file.additions}
                          </span>{' '}
                          <span className="text-[#B91C1C]">
                            -{file.deletions}
                          </span>
                        </span>
                      </div>
                      {openCount > 0 && (
                        <div className="mt-1 text-[11px] font-medium text-[#B45309]">
                          {openCount} open review note
                          {openCount > 1 ? 's' : ''}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Centre: Readable unified diff */}
        <section
          aria-labelledby="diff-viewer-heading"
          className="flex min-w-0 flex-col rounded border border-[#E5E1D8] bg-white lg:col-span-5 xl:col-span-1"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E1D8] px-4 py-3">
            <h2
              id="diff-viewer-heading"
              className="truncate font-mono text-xs font-semibold text-[#1A1C1E]"
            >
              {activeFile ? activeFile.path : 'Unified diff'}
            </h2>
            {activeFile && (
              <span className="font-mono text-xs text-[#5C6066] tabular-nums">
                <span className="text-[#15803D]">+{activeFile.additions}</span>{' '}
                <span className="text-[#B91C1C]">-{activeFile.deletions}</span>{' '}
                · {shortSha(run.commitSha)}
              </span>
            )}
          </div>

          {activeFile ? (
            <>
              <div className="max-h-[540px] overflow-auto bg-[#FDFCFA] font-mono text-xs leading-5">
                <table className="w-full border-collapse">
                  <tbody>
                    {parsedLines.map((line, idx) => {
                      const rowBg =
                        line.type === 'add'
                          ? 'bg-[#ECFDF3] text-[#14532D]'
                          : line.type === 'del'
                          ? 'bg-[#FEF2F2] text-[#7F1D1D]'
                          : line.type === 'hunk'
                          ? 'bg-[#F3F6FC] text-[#1E40AF]'
                          : line.type === 'meta'
                          ? 'bg-[#F4F2EC] text-[#5C6066]'
                          : 'text-[#1A1C1E]';

                      return (
                        <tr key={idx} className={rowBg}>
                          <td className="w-10 select-none border-r border-[#ECE9E1] px-2 py-0.5 text-right text-[11px] text-[#8B8F96] tabular-nums">
                            {line.oldLineNumber ?? ''}
                          </td>
                          <td className="w-10 select-none border-r border-[#ECE9E1] px-2 py-0.5 text-right text-[11px] text-[#8B8F96] tabular-nums">
                            {line.newLineNumber ?? ''}
                          </td>
                          <td className="w-5 select-none px-1.5 py-0.5 text-center font-semibold">
                            {line.type === 'add'
                              ? '+'
                              : line.type === 'del'
                              ? '-'
                              : ' '}
                          </td>
                          <td className="whitespace-pre px-2 py-0.5">
                            {line.content}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {fileFindings.length > 0 && (
                <div className="border-t border-[#E5E1D8] bg-[#FAF9F6] p-4 space-y-2.5">
                  <div className="text-xs font-semibold text-[#1A1C1E]">
                    File review notes ({fileFindings.length})
                  </div>
                  {fileFindings.map((finding) => (
                    <div
                      key={finding.id}
                      className="rounded border border-[#E5E1D8] bg-white p-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[#5C6066]">
                        <span className="font-medium text-[#1A1C1E]">
                          {finding.author} · line {finding.line}
                        </span>
                        <span
                          className={
                            finding.resolved
                              ? 'font-medium text-[#15803D]'
                              : finding.severity === 'blocker'
                              ? 'font-semibold text-[#B91C1C]'
                              : 'font-medium text-[#B45309]'
                          }
                        >
                          {finding.resolved ? 'Resolved' : finding.severity}
                        </span>
                      </div>
                      <p className="mt-1 leading-relaxed text-[#2C3036]">
                        {finding.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="p-6 text-xs text-[#5C6066]">
              Select a changed file on the left to read its unified diff.
            </div>
          )}
        </section>

        {/* Right: Test results & review log */}
        <section
          aria-labelledby="test-results-heading"
          className="min-w-0 space-y-4 lg:col-span-4 xl:col-span-1"
        >
          <div className="rounded border border-[#E5E1D8] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E1D8] px-4 py-3">
              <h2
                id="test-results-heading"
                className="text-xs font-semibold text-[#1A1C1E]"
              >
                Test results
              </h2>
              {run.testRuns.length > 1 && (
                <select
                  aria-label="Select test attempt"
                  value={selectedTestAttemptIdx}
                  onChange={(e) =>
                    setSelectedTestAttemptIdx(Number(e.target.value))
                  }
                  className="rounded border border-[#D4CFC4] bg-white px-2 py-0.5 font-mono text-[11px] text-[#1A1C1E]"
                >
                  {run.testRuns.map((tr, i) => (
                    <option key={tr.id} value={i}>
                      Run {i + 1} (exit {tr.exitCode})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {displayedTestRun ? (
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span
                    className={`font-semibold ${
                      displayedTestRun.exitCode === 0
                        ? 'text-[#15803D]'
                        : 'text-[#B91C1C]'
                    }`}
                  >
                    {displayedTestRun.exitCode === 0
                      ? 'Checks passed'
                      : 'Checks failed'}
                  </span>
                  <span className="font-mono text-[#1A1C1E] tabular-nums">
                    exit {displayedTestRun.exitCode} ·{' '}
                    {displayedTestRun.passedCount} passed,{' '}
                    {displayedTestRun.failedCount} failed ·{' '}
                    {(displayedTestRun.durationMs / 1000).toFixed(2)}s
                  </span>
                </div>

                <div className="rounded bg-[#FAF9F6] px-2.5 py-2 font-mono text-[11px] text-[#5C6066]">
                  <div>$ {displayedTestRun.command}</div>
                  <div className="mt-0.5 text-[10px]">
                    {displayedTestRun.runner}
                    {displayedTestRun.simulated ? ' · recorded demo output' : ''}
                  </div>
                </div>

                {displayedTestRun.cases.length > 0 && (
                  <ul className="divide-y divide-[#ECE9E1] border-t border-[#ECE9E1]">
                    {displayedTestRun.cases.map((tc) => (
                      <li key={tc.id} className="py-2 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-1.5 min-w-0">
                            {tc.status === 'passed' ? (
                              <CheckCircle2
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#15803D]"
                                aria-hidden="true"
                              />
                            ) : (
                              <XCircle
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B91C1C]"
                                aria-hidden="true"
                              />
                            )}
                            <span className="break-all font-mono text-[11px] text-[#1A1C1E]">
                              {tc.name}
                            </span>
                          </div>
                          <span className="shrink-0 font-mono text-[11px] text-[#5C6066] tabular-nums">
                            {tc.durationMs}ms
                          </span>
                        </div>
                        {tc.errorDetail && (
                          <p className="mt-1 pl-5 font-mono text-[11px] text-[#B91C1C]">
                            {tc.errorDetail}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="border-t border-[#ECE9E1] pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRawOutput((v) => !v)}
                    className="text-xs font-medium text-[#1E40AF] hover:text-[#1E3A8A]"
                  >
                    {showRawOutput
                      ? 'Hide raw runner output'
                      : 'Show raw runner output'}
                  </button>
                  {showRawOutput && (
                    <pre className="mt-2 max-h-56 overflow-auto rounded border border-[#E5E1D8] bg-[#FAF9F6] p-3 font-mono text-[11px] leading-relaxed text-[#1A1C1E] whitespace-pre-wrap">
                      {displayedTestRun.rawOutput}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <p className="p-4 text-xs text-[#5C6066]">
                No test runs recorded yet.
              </p>
            )}
          </div>

          {/* Review decision history */}
          <div className="rounded border border-[#E5E1D8] bg-white p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-[#1A1C1E]">
              Revision &amp; approval audit log
            </h3>
            {run.reviewHistory.length === 0 ? (
              <p className="text-xs text-[#5C6066]">
                No human review decisions recorded on this run yet.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {run.reviewHistory.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-t border-[#ECE9E1] pt-2.5 text-xs first:border-t-0 first:pt-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span
                        className={
                          entry.action === 'approved'
                            ? 'font-semibold text-[#15803D]'
                            : entry.action === 'approval_invalidated'
                            ? 'font-semibold text-[#B91C1C]'
                            : 'font-semibold text-[#B45309]'
                        }
                      >
                        {entry.action === 'approved'
                          ? 'Approved revision'
                          : entry.action === 'approval_invalidated'
                          ? 'Approval invalidated'
                          : 'Changes requested'}
                      </span>
                      <span className="font-mono text-[11px] text-[#5C6066]">
                        {shortSha(entry.commitSha)}
                      </span>
                    </div>
                    <p className="mt-1 text-[#2C3036]">{entry.comment}</p>
                    <div className="mt-0.5 text-[11px] text-[#5C6066] tabular-nums">
                      {entry.reviewer} · {formatShortDate(entry.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Separate Pull Request & Merge Confirmation Section */}
      {pr && (
        <section
          aria-labelledby="pull-request-merge-heading"
          className="rounded border border-[#E5E1D8] bg-white p-5"
        >
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {pr.status === 'merged' ? (
                  <GitMerge
                    className="h-4 w-4 text-[#15803D]"
                    aria-hidden="true"
                  />
                ) : (
                  <GitPullRequest
                    className="h-4 w-4 text-[#1E40AF]"
                    aria-hidden="true"
                  />
                )}
                <h2
                  id="pull-request-merge-heading"
                  className="text-base font-semibold text-[#1A1C1E]"
                >
                  Pull request #{pr.number} —{' '}
                  {pr.status === 'merged' ? 'Merged' : 'Open'}
                </h2>
                <span aria-hidden="true" className="text-[#B8B2A5]">
                  ·
                </span>
                <span className="font-mono text-xs text-[#5C6066]">
                  {project?.repository || connection.selectedRepository}
                </span>
                {pr.simulated && (
                  <>
                    <span aria-hidden="true" className="text-[#B8B2A5]">
                      ·
                    </span>
                    <span className="text-xs text-[#5C6066]">
                      Simulated GitHub PR
                    </span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-[#5C6066]">
                <span>
                  {pr.branchName} → {pr.baseBranch}
                </span>
                <span>head: {shortSha(pr.headSha)}</span>
                <span>
                  approved SHA:{' '}
                  {pr.approvedSha ? shortSha(pr.approvedSha) : 'none'}
                </span>
                {pr.mergeCommitSha && (
                  <span className="text-[#15803D]">
                    merge commit: {shortSha(pr.mergeCommitSha)}
                  </span>
                )}
              </div>

              {pr.status === 'merged' ? (
                <p className="text-xs text-[#15803D]">
                  Merged by {pr.mergedBy} on {formatShortDate(pr.mergedAt)} from
                  approved revision {shortSha(pr.headSha)}.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1 text-xs">
                  <span
                    className={
                      mergeGate.checksPassed
                        ? 'text-[#15803D]'
                        : 'text-[#B91C1C]'
                    }
                  >
                    {mergeGate.checksPassed
                      ? 'Required tests passed'
                      : 'Required tests failing'}
                  </span>
                  <span
                    className={
                      mergeGate.approvedForCurrentSha
                        ? 'text-[#15803D]'
                        : 'text-[#B45309]'
                    }
                  >
                    {mergeGate.approvedForCurrentSha
                      ? `Approved at exact revision ${shortSha(run.commitSha)} (${pr.approvedBy})`
                      : `Awaiting approval for revision ${shortSha(run.commitSha)}`}
                  </span>
                </div>
              )}
            </div>

            {pr.status === 'open' && (
              <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
                {!showMergeConfirm ? (
                  <button
                    type="button"
                    disabled={!mergeGate.canMerge}
                    onClick={() => setShowMergeConfirm(true)}
                    className="inline-flex items-center gap-1.5 rounded bg-[#15803D] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#166534] disabled:cursor-not-allowed disabled:bg-[#D4CFC4] disabled:text-[#5C6066] whitespace-nowrap"
                  >
                    <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {pr.simulated
                        ? 'Merge pull request (Simulated)'
                        : 'Merge pull request'}
                    </span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 rounded border border-[#15803D] bg-[#F0FDF4] p-2.5">
                    <span className="text-xs font-medium text-[#166534]">
                      Confirm merge of{' '}
                      <span className="font-mono">
                        {shortSha(run.commitSha)}
                      </span>{' '}
                      into <span className="font-mono">{pr.baseBranch}</span>?
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMergeConfirm(false)}
                      className="rounded border border-[#D4CFC4] bg-white px-2.5 py-1 text-xs font-medium text-[#1A1C1E]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={merging}
                      onClick={handleConfirmMerge}
                      className="rounded bg-[#15803D] px-3 py-1 text-xs font-semibold text-white hover:bg-[#166534] disabled:opacity-50 whitespace-nowrap"
                    >
                      {merging ? 'Merging...' : 'Confirm merge'}
                    </button>
                  </div>
                )}
                {!mergeGate.canMerge && mergeGate.reasons[0] && (
                  <p className="text-xs text-[#5C6066]">
                    {mergeGate.reasons[0]}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

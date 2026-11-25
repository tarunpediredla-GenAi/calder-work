import { useEffect, useState } from 'react';
import { ArrowRight, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { getLatestTestRun, shortSha } from '../lib/workflow';
import type {
  AcceptanceCriterion,
  ConnectionState,
  DeliveryRun,
  MissingInfoFlag,
  Project,
  WorkItem,
} from '../types/calder';
import { formatShortDate, WorkStatusText } from './StatusLabel';

interface WorkItemViewProps {
  project: Project | null;
  workItem: WorkItem | null;
  projectWorkItems: WorkItem[];
  runs: DeliveryRun[];
  reviewers: string[];
  connection: ConnectionState;
  onSelectWorkItem: (workItemId: string) => void;
  onSaveWorkItem: (
    id: string,
    payload: {
      assignedReviewer?: string;
      acceptanceCriteria?: AcceptanceCriterion[];
      missingInfoFlags?: MissingInfoFlag[];
    }
  ) => Promise<void>;
  onApprovePlan: (workItemId: string) => Promise<void>;
  onDraftWithGemini: (workItemId: string) => Promise<string>;
  onOpenRun: (runId: string) => void;
  onOpenReview: (runId: string) => void;
  onOpenNewWorkItem: () => void;
}

export function WorkItemView({
  project,
  workItem,
  projectWorkItems,
  runs,
  reviewers,
  connection,
  onSelectWorkItem,
  onSaveWorkItem,
  onApprovePlan,
  onDraftWithGemini,
  onOpenRun,
  onOpenReview,
  onOpenNewWorkItem,
}: WorkItemViewProps) {
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([]);
  const [flags, setFlags] = useState<MissingInfoFlag[]>([]);
  const [reviewer, setReviewer] = useState('Priya Nair');
  const [newCriterionText, setNewCriterionText] = useState('');
  const [newCriterionCategory, setNewCriterionCategory] =
    useState<AcceptanceCriterion['category']>('functional');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [draftingGemini, setDraftingGemini] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (workItem) {
      setCriteria(workItem.acceptanceCriteria);
      setFlags(workItem.missingInfoFlags);
      setReviewer(workItem.assignedReviewer);
      setDirty(false);
      setFeedbackMsg(null);
      setErrorMsg(null);
    }
  }, [workItem?.id, workItem?.updatedAt]);

  if (!workItem) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="rounded border border-[#E5E1D8] bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-[#1A1C1E]">
            No work item selected
          </h1>
          <p className="mt-1 text-sm text-[#5C6066]">
            Select a work item from Projects or submit a new feature request.
          </p>
          <button
            type="button"
            onClick={onOpenNewWorkItem}
            className="mt-4 rounded bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A]"
          >
            New work item
          </button>
        </div>
      </div>
    );
  }

  const itemRuns = runs.filter((r) => r.workItemId === workItem.id);

  async function handleSaveChanges() {
    if (!workItem) return;
    setSaving(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      await onSaveWorkItem(workItem.id, {
        assignedReviewer: reviewer,
        acceptanceCriteria: criteria,
        missingInfoFlags: flags,
      });
      setDirty(false);
      setFeedbackMsg('Work item plan saved.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function handleApproveAndStart() {
    if (!workItem) return;
    setApproving(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      if (dirty) {
        await onSaveWorkItem(workItem.id, {
          assignedReviewer: reviewer,
          acceptanceCriteria: criteria,
          missingInfoFlags: flags,
        });
        setDirty(false);
      }
      await onApprovePlan(workItem.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start run.');
    } finally {
      setApproving(false);
    }
  }

  async function handleGeminiRefine() {
    if (!workItem) return;
    setDraftingGemini(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const model = await onDraftWithGemini(workItem.id);
      setFeedbackMsg(
        `Acceptance criteria refreshed by server-side Requirements analyst (${model}).`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gemini requirements analysis failed.'
      );
    } finally {
      setDraftingGemini(false);
    }
  }

  function handleAddCriterion() {
    const text = newCriterionText.trim();
    if (!text) return;
    setCriteria((prev) => [
      ...prev,
      {
        id: `ac-user-${Date.now()}`,
        text,
        category: newCriterionCategory,
        verified: false,
      },
    ]);
    setNewCriterionText('');
    setDirty(true);
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-6 p-5 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5E1D8] pb-5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C6066]">
            <span className="font-mono font-semibold text-[#1A1C1E]">
              {workItem.key}
            </span>
            <span aria-hidden="true">·</span>
            <WorkStatusText status={workItem.status} />
            {project && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{project.repository}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              Created {formatShortDate(workItem.createdAt)}
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-[#1A1C1E]">
            {workItem.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {projectWorkItems.length > 1 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="work-item-switcher"
                className="text-xs text-[#5C6066] whitespace-nowrap"
              >
                Switch item
              </label>
              <select
                id="work-item-switcher"
                value={workItem.id}
                onChange={(e) => onSelectWorkItem(e.target.value)}
                className="rounded border border-[#D4CFC4] bg-white px-2.5 py-1.5 text-xs text-[#1A1C1E]"
              >
                {projectWorkItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.key}: {item.title.slice(0, 42)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {workItem.status === 'draft_plan' ? (
            <button
              type="button"
              disabled={approving || criteria.length === 0}
              onClick={handleApproveAndStart}
              className="inline-flex items-center gap-1.5 rounded bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1E3A8A] disabled:opacity-50 whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {approving
                  ? 'Starting run...'
                  : connection.mode === 'demo'
                  ? 'Approve plan & start run (Simulated)'
                  : 'Approve plan & start run'}
              </span>
            </button>
          ) : (
            itemRuns[0] && (
              <button
                type="button"
                onClick={() => onOpenReview(itemRuns[0].id)}
                className="inline-flex items-center gap-1.5 rounded bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] whitespace-nowrap"
              >
                <span>Open review</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]"
        >
          {errorMsg}
        </div>
      )}

      {feedbackMsg && (
        <div
          role="status"
          className="rounded border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]"
        >
          {feedbackMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <section className="rounded border border-[#E5E1D8] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#1A1C1E]">
              Original request
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-[#2C3036]">
              {workItem.requestText}
            </p>
            <div className="mt-3 text-xs text-[#5C6066]">
              Submitted by {workItem.createdBy}
              {workItem.planApprovedAt && (
                <>
                  {' '}
                  · Plan approved {formatShortDate(workItem.planApprovedAt)}
                </>
              )}
            </div>
          </section>

          <section className="rounded border border-[#E5E1D8] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-[#1A1C1E]">
                  Acceptance criteria
                </h2>
                <p className="mt-0.5 text-xs text-[#5C6066]">
                  Edit, add, or refine criteria before approving the delivery
                  plan.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={draftingGemini}
                  onClick={handleGeminiRefine}
                  className="inline-flex items-center gap-1.5 rounded border border-[#D4CFC4] bg-white px-3 py-1.5 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC] disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${
                      draftingGemini ? 'animate-spin' : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    {draftingGemini ? 'Drafting...' : 'Draft with Gemini'}
                  </span>
                </button>

                {dirty && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveChanges}
                    className="rounded bg-[#1A1C1E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2F3338] disabled:opacity-50 whitespace-nowrap"
                  >
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              {criteria.map((criterion, index) => (
                <div
                  key={criterion.id}
                  className="flex items-start gap-2.5 rounded border border-[#ECE9E1] bg-[#FAF9F6] p-3"
                >
                  <span className="mt-1.5 w-5 shrink-0 font-mono text-xs text-[#5C6066] tabular-nums">
                    {index + 1}.
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <textarea
                      aria-label={`Acceptance criterion ${index + 1}`}
                      rows={2}
                      value={criterion.text}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCriteria((prev) =>
                          prev.map((c) =>
                            c.id === criterion.id ? { ...c, text: value } : c
                          )
                        );
                        setDirty(true);
                      }}
                      className="w-full resize-none rounded border border-[#E5E1D8] bg-white px-2.5 py-1.5 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#5C6066]">
                      <select
                        aria-label={`Category for criterion ${index + 1}`}
                        value={criterion.category}
                        onChange={(e) => {
                          const cat = e.target
                            .value as AcceptanceCriterion['category'];
                          setCriteria((prev) =>
                            prev.map((c) =>
                              c.id === criterion.id
                                ? { ...c, category: cat }
                                : c
                            )
                          );
                          setDirty(true);
                        }}
                        className="rounded border border-[#D4CFC4] bg-white px-2 py-0.5 text-xs text-[#1A1C1E]"
                      >
                        <option value="functional">functional</option>
                        <option value="validation">validation</option>
                        <option value="ui">ui</option>
                        <option value="testing">testing</option>
                      </select>
                      {criterion.verified && (
                        <span className="font-medium text-[#15803D]">
                          Verified by latest run
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove criterion ${index + 1}`}
                    onClick={() => {
                      setCriteria((prev) =>
                        prev.filter((c) => c.id !== criterion.id)
                      );
                      setDirty(true);
                    }}
                    className="rounded p-1.5 text-[#5C6066] hover:bg-[#ECE9E1] hover:text-[#B91C1C]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-[#ECE9E1] pt-4 sm:flex-row">
              <input
                type="text"
                aria-label="Add acceptance criterion"
                value={newCriterionText}
                onChange={(e) => setNewCriterionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCriterion();
                  }
                }}
                placeholder="Add another acceptance criterion..."
                className="flex-1 rounded border border-[#D4CFC4] bg-white px-3 py-1.5 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
              />
              <select
                aria-label="New criterion category"
                value={newCriterionCategory}
                onChange={(e) =>
                  setNewCriterionCategory(
                    e.target.value as AcceptanceCriterion['category']
                  )
                }
                className="rounded border border-[#D4CFC4] bg-white px-2.5 py-1.5 text-xs text-[#1A1C1E]"
              >
                <option value="functional">functional</option>
                <option value="validation">validation</option>
                <option value="ui">ui</option>
                <option value="testing">testing</option>
              </select>
              <button
                type="button"
                onClick={handleAddCriterion}
                className="inline-flex items-center justify-center gap-1 rounded border border-[#D4CFC4] bg-white px-3 py-1.5 text-xs font-semibold text-[#1A1C1E] hover:bg-[#F4F2EC] whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add</span>
              </button>
            </div>
          </section>

          {flags.length > 0 && (
            <section className="rounded border border-[#E5E1D8] bg-white p-5">
              <h2 className="text-sm font-semibold text-[#1A1C1E]">
                Flagged missing information
              </h2>
              <p className="mt-0.5 text-xs text-[#5C6066]">
                Questions raised by the Requirements analyst before code
                generation.
              </p>
              <div className="mt-3 space-y-3">
                {flags.map((flag, idx) => (
                  <div
                    key={flag.id}
                    className="rounded border border-[#ECE9E1] bg-[#FAF9F6] p-3.5"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          flag.severity === 'blocking'
                            ? 'font-semibold text-[#B91C1C]'
                            : 'font-semibold text-[#B45309]'
                        }
                      >
                        {flag.severity === 'blocking'
                          ? 'Blocking question'
                          : 'Clarification'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#1A1C1E]">
                      {flag.question}
                    </p>
                    <label
                      htmlFor={`flag-res-${idx}`}
                      className="mt-2 block text-xs text-[#5C6066]"
                    >
                      Resolution / assumption
                    </label>
                    <input
                      id={`flag-res-${idx}`}
                      type="text"
                      value={flag.resolution || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFlags((prev) =>
                          prev.map((f) =>
                            f.id === flag.id ? { ...f, resolution: val } : f
                          )
                        );
                        setDirty(true);
                      }}
                      placeholder="Record decision for Architect and engineers..."
                      className="mt-1 w-full rounded border border-[#D4CFC4] bg-white px-2.5 py-1.5 text-xs text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-6 lg:col-span-4">
          <section className="rounded border border-[#E5E1D8] bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#1A1C1E]">
              Delivery controls
            </h2>

            <div>
              <label
                htmlFor="assigned-reviewer-select"
                className="mb-1 block text-xs font-medium text-[#5C6066]"
              >
                Assigned reviewer
              </label>
              <select
                id="assigned-reviewer-select"
                value={reviewer}
                onChange={(e) => {
                  const next = e.target.value;
                  setReviewer(next);
                  setDirty(true);
                }}
                className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
              >
                {reviewers.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 border-t border-[#ECE9E1] pt-3 text-xs text-[#5C6066]">
              <div className="flex items-center justify-between">
                <span>Workflow engine</span>
                <span className="font-mono text-[#1A1C1E]">
                  LangGraph (8 agents)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Auto-correction budget</span>
                <span className="font-mono tabular-nums text-[#1A1C1E]">
                  Max 2 attempts
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Execution mode</span>
                <span className="font-medium text-[#1A1C1E]">
                  {connection.mode === 'connected'
                    ? 'Connected'
                    : 'Demo (simulated)'}
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={approving || criteria.length === 0}
              onClick={handleApproveAndStart}
              className="w-full rounded bg-[#1E40AF] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#1E3A8A] disabled:opacity-50"
            >
              {approving
                ? 'Running agents...'
                : workItem.planApprovedAt
                ? 'Start new run from current plan'
                : 'Approve plan & start run'}
            </button>
          </section>

          <section className="rounded border border-[#E5E1D8] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#1A1C1E]">
              Run history
            </h2>
            {itemRuns.length === 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-[#5C6066]">
                No runs started yet. Review the acceptance criteria and click{' '}
                <strong>Approve plan &amp; start run</strong> to begin code
                generation.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-[#ECE9E1]">
                {itemRuns.map((run) => {
                  const latestTest = getLatestTestRun(run);
                  return (
                    <div key={run.id} className="space-y-2 py-3 first:pt-0">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-semibold text-[#1A1C1E]">
                          Run #{run.runNumber} · rev-{run.revisionNumber}
                        </span>
                        <WorkStatusText status={run.status} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#5C6066] tabular-nums">
                        <span>{shortSha(run.commitSha)}</span>
                        {latestTest && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              exit {latestTest.exitCode} (
                              {latestTest.passedCount} pass /{' '}
                              {latestTest.failedCount} fail)
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onOpenRun(run.id)}
                          className="rounded border border-[#D4CFC4] px-2.5 py-1 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC]"
                        >
                          Run details
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenReview(run.id)}
                          className="rounded border border-[#1E40AF] px-2.5 py-1 text-xs font-semibold text-[#1E40AF] hover:bg-[#F3F6FC]"
                        >
                          Review diff
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

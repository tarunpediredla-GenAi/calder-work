import { FormEvent, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { getLatestTestRun, shortSha } from '../lib/workflow';
import type {
  AgentStep,
  DeliveryRun,
  Project,
  WorkItem,
} from '../types/calder';
import { formatShortDate, StepStatusText, WorkStatusText } from './StatusLabel';

interface RunDetailsViewProps {
  project: Project | null;
  workItem: WorkItem | null;
  run: DeliveryRun | null;
  onOpenReview: () => void;
  onBackToWorkItem: () => void;
  onResumePausedRun: (runId: string, guidance: string) => Promise<void>;
}

export function RunDetailsView({
  project,
  workItem,
  run,
  onOpenReview,
  onBackToWorkItem,
  onResumePausedRun,
}: RunDetailsViewProps) {
  const [selectedStepId, setSelectedStepId] = useState<string>('');
  const [guidance, setGuidance] = useState('');
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  useEffect(() => {
    if (!run || !run.steps.length) {
      setSelectedStepId('');
      return;
    }
    const defaultStep =
      run.steps.find((s) => s.status === 'failed') ??
      run.steps.find((s) => s.artifact) ??
      run.steps[0];
    setSelectedStepId(defaultStep.id);
  }, [run?.id, run?.updatedAt]);

  if (!run || !workItem) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="rounded border border-[#E5E1D8] bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-[#1A1C1E]">
            No delivery run selected
          </h1>
          <p className="mt-1 text-sm text-[#5C6066]">
            Approve the plan on a work item to start the 8-agent LangGraph run.
          </p>
          <button
            type="button"
            onClick={onBackToWorkItem}
            className="mt-4 rounded bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A]"
          >
            Open work item
          </button>
        </div>
      </div>
    );
  }

  const selectedStep: AgentStep | null =
    run.steps.find((s) => s.id === selectedStepId) ?? run.steps[0] ?? null;
  const latestTest = getLatestTestRun(run);

  const stage1 = run.steps.filter((s) => s.stageOrder < 3);
  const parallelSteps = run.steps.filter(
    (s) => s.parallelGroup === 'implementation'
  );
  const stagePost = run.steps.filter((s) => s.stageOrder > 3);

  async function handleResumeSubmit(event: FormEvent) {
    event.preventDefault();
    if (!run) return;
    setResumeError(null);
    if (guidance.trim().length < 6) {
      setResumeError('Enter clear engineering guidance before resuming.');
      return;
    }
    setResuming(true);
    try {
      await onResumePausedRun(run.id, guidance.trim());
      setGuidance('');
    } catch (err) {
      setResumeError(
        err instanceof Error ? err.message : 'Unable to resume run.'
      );
    } finally {
      setResuming(false);
    }
  }

  function renderStepButton(step: AgentStep) {
    const isSelected = selectedStep?.id === step.id;
    return (
      <button
        key={step.id}
        type="button"
        onClick={() => setSelectedStepId(step.id)}
        aria-pressed={isSelected}
        className={`w-full rounded border px-4 py-3 text-left transition-colors ${
          isSelected
            ? 'border-[#1E40AF] bg-[#F3F6FC]'
            : 'border-[#E5E1D8] bg-white hover:bg-[#FAF9F6]'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {step.status === 'completed' && (
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-[#15803D]"
                aria-hidden="true"
              />
            )}
            {step.status === 'failed' && (
              <XCircle
                className="h-4 w-4 shrink-0 text-[#B91C1C]"
                aria-hidden="true"
              />
            )}
            {(step.status === 'pending' ||
              step.status === 'skipped' ||
              step.status === 'running' ||
              step.status === 'awaiting_approval') && (
              <Clock
                className="h-4 w-4 shrink-0 text-[#5C6066]"
                aria-hidden="true"
              />
            )}
            <span className="truncate text-sm font-semibold text-[#1A1C1E]">
              {step.label}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StepStatusText status={step.status} />
            {typeof step.durationMs === 'number' && step.durationMs > 0 && (
              <span className="font-mono text-xs text-[#5C6066] tabular-nums">
                {(step.durationMs / 1000).toFixed(2)}s
              </span>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-xs text-[#5C6066]">{step.outputsSummary}</p>
        {step.errorMessage && (
          <p className="mt-1 font-mono text-xs text-[#B91C1C]">
            {step.errorMessage}
          </p>
        )}
      </button>
    );
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6 p-5 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5E1D8] pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C6066]">
            <span className="font-mono font-semibold text-[#1A1C1E]">
              {workItem.key} · Run #{run.runNumber} · rev-{run.revisionNumber}
            </span>
            <span aria-hidden="true">·</span>
            <WorkStatusText status={run.status} />
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[#1A1C1E]">
              {shortSha(run.commitSha)}
            </span>
            {run.simulated && (
              <>
                <span aria-hidden="true">·</span>
                <span>Demo workspace (simulated)</span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1A1C1E]">
            Run details — {workItem.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs text-[#5C6066] tabular-nums">
            {project && <span className="font-mono">{project.repository}</span>}
            <span aria-hidden="true">·</span>
            <span>
              Auto-corrections: {run.autoCorrectionAttempts} /{' '}
              {run.maxAutoCorrectionAttempts}
            </span>
            {latestTest && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-mono ${
                    latestTest.exitCode === 0
                      ? 'text-[#15803D]'
                      : 'text-[#B91C1C]'
                  }`}
                >
                  test exit code {latestTest.exitCode} ({latestTest.passedCount}{' '}
                  passed, {latestTest.failedCount} failed)
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>Updated {formatShortDate(run.updatedAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBackToWorkItem}
            className="rounded border border-[#D4CFC4] bg-white px-3.5 py-2 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC] whitespace-nowrap"
          >
            Work item
          </button>
          <button
            type="button"
            onClick={onOpenReview}
            className="inline-flex items-center gap-1.5 rounded bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] whitespace-nowrap"
          >
            <span>Inspect diff &amp; tests</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {run.status === 'paused_human_decision' && (
        <section
          role="alert"
          className="rounded border border-[#FCA5A5] bg-[#FEF2F2] p-5 space-y-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C]"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-[#991B1B]">
                Run paused — human decision required ({run.autoCorrectionAttempts}{' '}
                / {run.maxAutoCorrectionAttempts} auto-correction attempts used)
              </h2>
              <p className="text-sm text-[#7F1D1D]">
                {run.pauseReason ||
                  'Tests continued failing after two automatic correction attempts. Provide guidance below to resume or inspect the diff.'}
              </p>
            </div>
          </div>

          <form
            onSubmit={handleResumeSubmit}
            className="flex flex-col gap-2.5 pt-1 sm:flex-row"
          >
            <input
              type="text"
              aria-label="Engineering decision guidance"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="e.g. Skip 8-digit validation when manifest.status == 'draft' and add test coverage..."
              className="flex-1 rounded border border-[#FCA5A5] bg-white px-3 py-2 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
            />
            <button
              type="submit"
              disabled={resuming}
              className="rounded bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50 whitespace-nowrap"
            >
              {resuming
                ? 'Resuming...'
                : 'Apply guidance & resume (Simulated)'}
            </button>
          </form>
          {resumeError && (
            <p className="text-xs font-medium text-[#991B1B]">{resumeError}</p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section
          aria-label="LangGraph agent workflow steps"
          className="space-y-3 lg:col-span-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1A1C1E]">
              LangGraph workflow ({run.steps.length} agents)
            </h2>
            <span className="text-xs text-[#5C6066]">
              Click any step to inspect output
            </span>
          </div>

          {run.steps.length === 0 ? (
            <div className="rounded border border-[#E5E1D8] bg-white p-5 text-sm text-[#5C6066]">
              Historical run summary stored. Open Review to inspect PR and merge
              status.
            </div>
          ) : (
            <div className="space-y-2.5">
              {stage1.map((step) => renderStepButton(step))}

              {parallelSteps.length > 0 && (
                <div className="space-y-2 rounded border border-dashed border-[#D4CFC4] bg-[#F7F5F0] p-3">
                  <div className="flex items-center justify-between text-xs font-medium text-[#5C6066]">
                    <span>Parallel implementation after Architect contract</span>
                    <span className="font-mono text-[11px]">2 concurrent tracks</span>
                  </div>
                  <div className="space-y-2">
                    {parallelSteps.map((step) => renderStepButton(step))}
                  </div>
                </div>
              )}

              {stagePost.map((step) => renderStepButton(step))}
            </div>
          )}
        </section>

        <section
          aria-label="Selected agent step artifact"
          className="lg:col-span-7"
        >
          {selectedStep ? (
            <div className="rounded border border-[#E5E1D8] bg-white">
              <div className="border-b border-[#E5E1D8] px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-[#1A1C1E]">
                    {selectedStep.label}
                  </h2>
                  <StepStatusText status={selectedStep.status} />
                </div>
                <p className="mt-1 text-xs text-[#5C6066]">
                  {selectedStep.artifact?.title || selectedStep.outputsSummary}
                </p>
              </div>

              <div className="space-y-4 p-5">
                <dl className="grid grid-cols-1 gap-3 border-b border-[#ECE9E1] pb-4 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-[#5C6066]">Inputs</dt>
                    <dd className="mt-1 text-[#1A1C1E]">
                      {selectedStep.inputsSummary}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[#5C6066]">Outputs</dt>
                    <dd className="mt-1 text-[#1A1C1E]">
                      {selectedStep.outputsSummary}
                    </dd>
                  </div>
                </dl>

                {selectedStep.errorMessage && (
                  <div
                    role="alert"
                    className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3.5 py-2.5 font-mono text-xs text-[#991B1B]"
                  >
                    {selectedStep.errorMessage}
                  </div>
                )}

                {selectedStep.artifact?.structuredMeta && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[#ECE9E1] pb-4 text-xs">
                    {Object.entries(selectedStep.artifact.structuredMeta).map(
                      ([key, val]) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <span className="text-[#5C6066]">{key}:</span>
                          <span className="font-mono font-medium text-[#1A1C1E]">
                            {val}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-[#1A1C1E]">
                      Recorded deliverable
                    </h3>
                    {selectedStep.artifact?.kind && (
                      <span className="font-mono text-xs text-[#5C6066]">
                        {selectedStep.artifact.kind}
                      </span>
                    )}
                  </div>
                  <pre className="max-h-[480px] overflow-auto rounded border border-[#E5E1D8] bg-[#FAF9F6] p-4 font-mono text-xs leading-relaxed text-[#1A1C1E] whitespace-pre-wrap break-words">
                    {selectedStep.artifact?.content ||
                      'No artifact generated for this step.'}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded border border-[#E5E1D8] bg-white p-8 text-center text-sm text-[#5C6066]">
              Select an agent step on the left to inspect its inputs, outputs,
              and deliverables.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

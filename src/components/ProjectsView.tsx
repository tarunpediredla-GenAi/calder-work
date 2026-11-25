import { FormEvent, useState } from 'react';
import { ArrowRight, Plus, X } from 'lucide-react';
import { getLatestTestRun, shortSha } from '../lib/workflow';
import type { DeliveryRun, Project, WorkItem } from '../types/calder';
import { formatShortDate, WorkStatusText } from './StatusLabel';

interface ProjectsViewProps {
  projects: Project[];
  workItems: WorkItem[];
  runs: DeliveryRun[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  onOpenWorkItem: (workItemId: string) => void;
  onOpenRun: (workItemId: string, runId: string) => void;
  onOpenReview: (workItemId: string, runId: string) => void;
  onOpenNewWorkItem: (projectId: string) => void;
  onCreateProject: (payload: {
    name: string;
    clientName: string;
    repository: string;
    defaultBranch: string;
    stackSummary: string;
    description: string;
  }) => Promise<void>;
}

export function ProjectsView({
  projects,
  workItems,
  runs,
  selectedProjectId,
  onSelectProject,
  onOpenWorkItem,
  onOpenRun,
  onOpenReview,
  onOpenNewWorkItem,
  onCreateProject,
}: ProjectsViewProps) {
  const [showNewProject, setShowNewProject] = useState(false);
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [repository, setRepository] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [stackSummary, setStackSummary] = useState(
    'FastAPI · React · PostgreSQL'
  );
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'merged'>(
    'all'
  );

  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;

  const projectItems = workItems.filter((item) => {
    if (!selectedProject || item.projectId !== selectedProject.id) return false;
    if (statusFilter === 'open') return item.status !== 'merged';
    if (statusFilter === 'merged') return item.status === 'merged';
    return true;
  });

  async function handleCreateProjectSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await onCreateProject({
        name,
        clientName,
        repository,
        defaultBranch,
        stackSummary,
        description,
      });
      setName('');
      setClientName('');
      setRepository('');
      setDefaultBranch('main');
      setDescription('');
      setShowNewProject(false);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to create project.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-8 p-5 lg:p-8">
      <section aria-labelledby="projects-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              id="projects-heading"
              className="text-2xl font-semibold tracking-tight text-[#1A1C1E]"
            >
              Projects
            </h1>
            <p className="mt-1 text-sm text-[#5C6066]">
              Client repositories maintained by Calder Works, open work items,
              and latest delivery runs.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNewProject(true)}
            className="inline-flex items-center gap-1.5 rounded border border-[#D4CFC4] bg-white px-3.5 py-2 text-xs font-semibold text-[#1A1C1E] transition-colors hover:bg-[#F4F2EC] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New project</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded border border-[#E5E1D8] bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5E1D8] bg-[#F7F5F0] text-xs font-medium text-[#5C6066]">
                <th className="px-4 py-2.5">Project</th>
                <th className="px-4 py-2.5">Repository</th>
                <th className="px-4 py-2.5 text-right">Open work items</th>
                <th className="px-4 py-2.5">Latest run</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECE9E1]">
              {projects.map((project) => {
                const items = workItems.filter(
                  (w) => w.projectId === project.id
                );
                const openCount = items.filter(
                  (w) => w.status !== 'merged'
                ).length;
                const projectRuns = runs.filter((r) =>
                  items.some((w) => w.id === r.workItemId)
                );
                const latestRun = projectRuns[0] ?? null;
                const latestTest = latestRun
                  ? getLatestTestRun(latestRun)
                  : null;
                const isSelected = selectedProject?.id === project.id;

                return (
                  <tr
                    key={project.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-[#F3F6FC]' : 'hover:bg-[#FAF9F6]'
                    }`}
                  >
                    <td className="px-4 py-3.5 align-top">
                      <button
                        type="button"
                        onClick={() => onSelectProject(project.id)}
                        className="text-left font-semibold text-[#1A1C1E] hover:text-[#1E40AF] focus-visible:outline-none focus-visible:underline"
                      >
                        {project.name}
                      </button>
                      <div className="mt-0.5 text-xs text-[#5C6066]">
                        {project.clientName} · {project.stackSummary}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <div className="font-mono text-xs text-[#1A1C1E] whitespace-nowrap">
                        {project.repository}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-[#5C6066] whitespace-nowrap">
                        branch: {project.defaultBranch}
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-right align-top font-mono text-sm tabular-nums text-[#1A1C1E]">
                      {openCount}
                      <span className="ml-1 font-sans text-xs text-[#5C6066]">
                        / {items.length}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      {latestRun ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <WorkStatusText status={latestRun.status} />
                            <span aria-hidden="true" className="text-[#B8B2A5]">
                              ·
                            </span>
                            <span className="font-mono text-xs text-[#1A1C1E]">
                              {shortSha(latestRun.commitSha)}
                            </span>
                          </div>
                          <div className="text-xs text-[#5C6066] tabular-nums">
                            {latestTest
                              ? `exit ${latestTest.exitCode} · ${latestTest.passedCount} passed, ${latestTest.failedCount} failed`
                              : 'Pending tests'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-[#5C6066]">
                          No runs yet
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right align-top">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectProject(project.id);
                          onOpenNewWorkItem(project.id);
                        }}
                        className="text-xs font-semibold text-[#1E40AF] hover:text-[#1E3A8A] whitespace-nowrap"
                      >
                        Submit request
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedProject && (
        <section
          aria-labelledby="selected-project-work-items"
          className="space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E5E1D8] pt-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="selected-project-work-items"
                  className="text-lg font-semibold text-[#1A1C1E]"
                >
                  {selectedProject.name} — Work items
                </h2>
                <span aria-hidden="true" className="text-[#B8B2A5]">
                  ·
                </span>
                <span className="font-mono text-xs text-[#5C6066]">
                  {selectedProject.repository}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#5C6066]">
                {selectedProject.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div
                role="tablist"
                aria-label="Filter work items"
                className="flex items-center rounded border border-[#E5E1D8] bg-[#F4F2EC] p-0.5 text-xs"
              >
                {(['all', 'open', 'merged'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`rounded px-2.5 py-1 font-medium capitalize transition-colors ${
                      statusFilter === tab
                        ? 'bg-white text-[#1A1C1E]'
                        : 'text-[#5C6066] hover:text-[#1A1C1E]'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onOpenNewWorkItem(selectedProject.id)}
                className="inline-flex items-center gap-1.5 rounded bg-[#1E40AF] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1E3A8A] whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Submit work item</span>
              </button>
            </div>
          </div>

          {projectItems.length === 0 ? (
            <div className="rounded border border-[#E5E1D8] bg-white px-6 py-10 text-center">
              <p className="text-sm font-medium text-[#1A1C1E]">
                No work items match this filter for {selectedProject.name}.
              </p>
              <p className="mt-1 text-xs text-[#5C6066]">
                Submit a feature request to generate acceptance criteria and
                kick off a delivery run.
              </p>
              <button
                type="button"
                onClick={() => onOpenNewWorkItem(selectedProject.id)}
                className="mt-4 rounded bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A]"
              >
                Submit work item
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#ECE9E1] rounded border border-[#E5E1D8] bg-white">
              {projectItems.map((item) => {
                const run = item.latestRunId
                  ? runs.find((r) => r.id === item.latestRunId) ?? null
                  : null;
                const latestTest = run ? getLatestTestRun(run) : null;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between gap-4 px-5 py-4 md:flex-row md:items-center"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C6066]">
                        <span className="font-mono font-semibold text-[#1A1C1E]">
                          {item.key}
                        </span>
                        <span aria-hidden="true">·</span>
                        <WorkStatusText status={item.status} />
                        <span aria-hidden="true">·</span>
                        <span>Reviewer: {item.assignedReviewer}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          Updated {formatShortDate(item.updatedAt)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenWorkItem(item.id)}
                        className="block text-left text-base font-semibold text-[#1A1C1E] hover:text-[#1E40AF]"
                      >
                        {item.title}
                      </button>
                      <p className="line-clamp-2 text-sm text-[#5C6066]">
                        {item.requestText}
                      </p>
                      {run && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs text-[#5C6066] tabular-nums">
                          <span>rev-{run.revisionNumber}</span>
                          <span aria-hidden="true">·</span>
                          <span>{shortSha(run.commitSha)}</span>
                          {run.pullRequest && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>PR #{run.pullRequest.number}</span>
                            </>
                          )}
                          {latestTest && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  latestTest.exitCode === 0
                                    ? 'text-[#15803D]'
                                    : 'text-[#B91C1C]'
                                }
                              >
                                tests: {latestTest.passedCount} passed,{' '}
                                {latestTest.failedCount} failed (exit{' '}
                                {latestTest.exitCode})
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenWorkItem(item.id)}
                        className="rounded border border-[#D4CFC4] bg-white px-3 py-1.5 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC] whitespace-nowrap"
                      >
                        Work item
                      </button>
                      {run && (
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenRun(item.id, run.id)}
                            className="rounded border border-[#D4CFC4] bg-white px-3 py-1.5 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC] whitespace-nowrap"
                          >
                            Run details
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenReview(item.id, run.id)}
                            className="inline-flex items-center gap-1 rounded bg-[#1E40AF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A8A] whitespace-nowrap"
                          >
                            <span>Review</span>
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {showNewProject && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-project-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
        >
          <div className="w-full max-w-lg rounded border border-[#E5E1D8] bg-white">
            <div className="flex items-center justify-between border-b border-[#E5E1D8] px-5 py-4">
              <h2
                id="new-project-dialog-title"
                className="text-base font-semibold text-[#1A1C1E]"
              >
                Create project
              </h2>
              <button
                type="button"
                aria-label="Close create project dialog"
                onClick={() => setShowNewProject(false)}
                className="rounded p-1 text-[#5C6066] hover:bg-[#F4F2EC]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleCreateProjectSubmit}
              className="space-y-4 px-5 py-5"
            >
              {formError && (
                <div
                  role="alert"
                  className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-xs text-[#991B1B]"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="project-name-input"
                    className="mb-1 block text-xs font-medium text-[#1A1C1E]"
                  >
                    Project name
                  </label>
                  <input
                    id="project-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Library Lending Portal"
                    className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="project-client-input"
                    className="mb-1 block text-xs font-medium text-[#1A1C1E]"
                  >
                    Client organization
                  </label>
                  <input
                    id="project-client-input"
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. St. Jude College"
                    className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="project-repo-input"
                    className="mb-1 block text-xs font-medium text-[#1A1C1E]"
                  >
                    Repository (owner/repo)
                  </label>
                  <input
                    id="project-repo-input"
                    type="text"
                    required
                    value={repository}
                    onChange={(e) => setRepository(e.target.value)}
                    placeholder="calder-clients/library-lending"
                    className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 font-mono text-xs text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="project-branch-input"
                    className="mb-1 block text-xs font-medium text-[#1A1C1E]"
                  >
                    Default branch
                  </label>
                  <input
                    id="project-branch-input"
                    type="text"
                    required
                    value={defaultBranch}
                    onChange={(e) => setDefaultBranch(e.target.value)}
                    className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 font-mono text-xs text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="project-stack-input"
                  className="mb-1 block text-xs font-medium text-[#1A1C1E]"
                >
                  Application stack
                </label>
                <input
                  id="project-stack-input"
                  type="text"
                  value={stackSummary}
                  onChange={(e) => setStackSummary(e.target.value)}
                  className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="project-desc-input"
                  className="mb-1 block text-xs font-medium text-[#1A1C1E]"
                >
                  Summary
                </label>
                <textarea
                  id="project-desc-input"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description of the customer application."
                  className="w-full rounded border border-[#D4CFC4] bg-white px-3 py-2 text-sm text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[#ECE9E1] pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewProject(false)}
                  className="rounded border border-[#D4CFC4] px-3.5 py-2 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

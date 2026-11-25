import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConnectionsView } from './components/ConnectionsView';
import { ProjectsView } from './components/ProjectsView';
import { ReviewView } from './components/ReviewView';
import { RunDetailsView } from './components/RunDetailsView';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { WorkItemModal } from './components/WorkItemModal';
import { WorkItemView } from './components/WorkItemView';
import { api } from './lib/api';
import type {
  AcceptanceCriterion,
  MissingInfoFlag,
  ScreenId,
  WorkspaceSnapshot,
} from './types/calder';

const VALID_SCREENS: ScreenId[] = [
  'projects',
  'work-item',
  'run-details',
  'review',
  'connections',
];

function readUrlState(): {
  screen: ScreenId;
  projectId: string | null;
  workItemId: string | null;
  runId: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const rawScreen = params.get('screen') as ScreenId | null;
  const screen: ScreenId =
    rawScreen && VALID_SCREENS.includes(rawScreen) ? rawScreen : 'projects';
  return {
    screen,
    projectId: params.get('project'),
    workItemId: params.get('workItem'),
    runId: params.get('run'),
  };
}

function writeUrlState(state: {
  screen: ScreenId;
  projectId: string | null;
  workItemId: string | null;
  runId: string | null;
}) {
  const params = new URLSearchParams();
  if (state.screen !== 'projects') params.set('screen', state.screen);
  if (state.projectId) params.set('project', state.projectId);
  if (state.workItemId) params.set('workItem', state.workItemId);
  if (state.runId) params.set('run', state.runId);
  const qs = params.toString();
  const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, '', nextUrl);
}

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const initialUrl = useMemo(() => readUrlState(), []);
  const [activeScreen, setActiveScreen] = useState<ScreenId>(initialUrl.screen);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialUrl.projectId || 'proj-campus-ops'
  );
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(
    initialUrl.workItemId
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(
    initialUrl.runId
  );

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [newWorkItemModalOpen, setNewWorkItemModalOpen] = useState(false);
  const [modalProjectId, setModalProjectId] = useState<string>('proj-campus-ops');

  const syncSelectionWithWorkspace = useCallback(
    (data: WorkspaceSnapshot) => {
      setSelectedProjectId((currentProj) => {
        if (data.projects.some((p) => p.id === currentProj)) return currentProj;
        return data.projects[0]?.id || '';
      });

      setSelectedWorkItemId((currentWi) => {
        if (currentWi && data.workItems.some((w) => w.id === currentWi)) {
          return currentWi;
        }
        const campusWi =
          data.workItems.find((w) => w.projectId === 'proj-campus-ops') ??
          data.workItems[0] ??
          null;
        return campusWi?.id || null;
      });

      setSelectedRunId((currentRun) => {
        if (currentRun && data.runs.some((r) => r.id === currentRun)) {
          return currentRun;
        }
        return data.runs[0]?.id || null;
      });
    },
    []
  );

  const fetchWorkspace = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getWorkspace();
      setWorkspace(data);
      syncSelectionWithWorkspace(data);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to load Calder Works.'
      );
    } finally {
      setLoading(false);
    }
  }, [syncSelectionWithWorkspace]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  useEffect(() => {
    if (!workspace) return;
    writeUrlState({
      screen: activeScreen,
      projectId: selectedProjectId || null,
      workItemId: selectedWorkItemId,
      runId: selectedRunId,
    });
  }, [
    workspace,
    activeScreen,
    selectedProjectId,
    selectedWorkItemId,
    selectedRunId,
  ]);

  if (loading && !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] p-6">
        <div className="text-sm text-[#5C6066]">Loading Calder Works...</div>
      </div>
    );
  }

  if (loadError || !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] p-6">
        <div className="max-w-md rounded border border-[#E5E1D8] bg-white p-6 text-center space-y-3">
          <h1 className="text-base font-semibold text-[#1A1C1E]">
            Unable to load workspace
          </h1>
          <p className="text-sm text-[#5C6066]">
            {loadError || 'Server returned an empty response.'}
          </p>
          <button
            type="button"
            onClick={fetchWorkspace}
            className="rounded bg-[#1E40AF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeProject =
    workspace.projects.find((p) => p.id === selectedProjectId) ??
    workspace.projects[0] ??
    null;

  const activeWorkItem =
    workspace.workItems.find((w) => w.id === selectedWorkItemId) ??
    workspace.workItems.find((w) => w.projectId === activeProject?.id) ??
    workspace.workItems[0] ??
    null;

  const activeRun =
    workspace.runs.find(
      (r) => r.id === selectedRunId && r.workItemId === activeWorkItem?.id
    ) ??
    (activeWorkItem?.latestRunId
      ? workspace.runs.find((r) => r.id === activeWorkItem.latestRunId) ?? null
      : null);

  const projectWorkItems = activeProject
    ? workspace.workItems.filter((w) => w.projectId === activeProject.id)
    : [];

  function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId);
    const firstItem = workspace?.workItems.find(
      (w) => w.projectId === projectId
    );
    if (firstItem) {
      setSelectedWorkItemId(firstItem.id);
      setSelectedRunId(firstItem.latestRunId);
    } else {
      setSelectedWorkItemId(null);
      setSelectedRunId(null);
    }
  }

  function handleOpenWorkItem(workItemId: string) {
    const item = workspace?.workItems.find((w) => w.id === workItemId);
    if (item) {
      setSelectedProjectId(item.projectId);
      setSelectedWorkItemId(item.id);
      setSelectedRunId(item.latestRunId);
      setActiveScreen('work-item');
    }
  }

  function handleOpenRun(workItemId: string, runId: string) {
    const item = workspace?.workItems.find((w) => w.id === workItemId);
    if (item) setSelectedProjectId(item.projectId);
    setSelectedWorkItemId(workItemId);
    setSelectedRunId(runId);
    setActiveScreen('run-details');
  }

  function handleOpenReview(workItemId: string, runId: string) {
    const item = workspace?.workItems.find((w) => w.id === workItemId);
    if (item) setSelectedProjectId(item.projectId);
    setSelectedWorkItemId(workItemId);
    setSelectedRunId(runId);
    setActiveScreen('review');
  }

  async function handleCreateProject(payload: {
    name: string;
    clientName: string;
    repository: string;
    defaultBranch: string;
    stackSummary: string;
    description: string;
  }) {
    const res = await api.createProject(payload);
    setWorkspace(res.workspace);
    setSelectedProjectId(res.project.id);
    setSelectedWorkItemId(null);
    setSelectedRunId(null);
  }

  async function handleCreateWorkItem(payload: {
    projectId: string;
    title?: string;
    requestText: string;
    assignedReviewer: string;
  }) {
    const res = await api.createWorkItem(payload);
    setWorkspace(res.workspace);
    setSelectedProjectId(res.workItem.projectId);
    setSelectedWorkItemId(res.workItem.id);
    setSelectedRunId(null);
    setActiveScreen('work-item');
  }

  async function handleSaveWorkItem(
    id: string,
    payload: {
      assignedReviewer?: string;
      acceptanceCriteria?: AcceptanceCriterion[];
      missingInfoFlags?: MissingInfoFlag[];
    }
  ) {
    const res = await api.updateWorkItem(id, payload);
    setWorkspace(res.workspace);
  }

  async function handleApprovePlan(workItemId: string) {
    const res = await api.approvePlan(workItemId);
    setWorkspace(res.workspace);
    setSelectedWorkItemId(res.workItem.id);
    setSelectedRunId(res.run.id);
    setActiveScreen('run-details');
  }

  async function handleDraftWithGemini(workItemId: string): Promise<string> {
    const res = await api.draftCriteriaWithGemini(workItemId);
    setWorkspace(res.workspace);
    return res.model;
  }

  async function handleRequestChanges(
    runId: string,
    payload: { comment: string; reviewer: string }
  ) {
    const res = await api.requestChanges(runId, payload);
    setWorkspace(res.workspace);
    setSelectedRunId(res.run.id);
  }

  async function handleApproveRevision(
    runId: string,
    payload: { reviewer: string; commitSha: string; comment?: string }
  ) {
    const res = await api.approveRevision(runId, payload);
    setWorkspace(res.workspace);
    setSelectedRunId(res.run.id);
  }

  async function handleMergePullRequest(
    runId: string,
    payload: { confirmed: boolean; confirmedBy: string; commitSha: string }
  ) {
    const res = await api.mergePullRequest(runId, payload);
    setWorkspace(res.workspace);
    setSelectedRunId(res.run.id);
  }

  async function handleResumePausedRun(runId: string, guidance: string) {
    const res = await api.resumePausedRun(runId, { guidance });
    setWorkspace(res.workspace);
    setSelectedRunId(res.run.id);
  }

  async function handleRunGeminiDiffReview(runId: string): Promise<string> {
    const res = await api.reviewDiffWithGemini(runId);
    setWorkspace(res.workspace);
    return res.model;
  }

  async function handleSelectRepository(repo: string) {
    const res = await api.selectRepository(repo);
    setWorkspace(res.workspace);
  }

  async function handleVerifyGitHub() {
    const res = await api.verifyGitHub();
    setWorkspace(res.workspace);
  }

  async function handleResetDemoWorkspace() {
    const fresh = await api.resetWorkspace();
    setWorkspace(fresh);
    setSelectedProjectId('proj-campus-ops');
    setSelectedWorkItemId(fresh.workItems[0]?.id || null);
    setSelectedRunId(fresh.workItems[0]?.latestRunId || null);
    setActiveScreen('projects');
  }

  return (
    <div className="flex min-h-screen bg-[#FAF9F6] text-[#1A1C1E]">
      <Sidebar
        activeScreen={activeScreen}
        onSelectScreen={setActiveScreen}
        projects={workspace.projects}
        selectedProjectId={activeProject?.id || ''}
        onSelectProject={handleSelectProject}
        activeWorkItem={activeWorkItem}
        connection={workspace.connection}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          activeScreen={activeScreen}
          project={activeProject}
          workItem={activeWorkItem}
          connection={workspace.connection}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenNewWorkItem={() => {
            setModalProjectId(activeProject?.id || workspace.projects[0]?.id || '');
            setNewWorkItemModalOpen(true);
          }}
        />

        <main className="flex-1">
          {activeScreen === 'projects' && (
            <ProjectsView
              projects={workspace.projects}
              workItems={workspace.workItems}
              runs={workspace.runs}
              selectedProjectId={activeProject?.id || ''}
              onSelectProject={handleSelectProject}
              onOpenWorkItem={handleOpenWorkItem}
              onOpenRun={handleOpenRun}
              onOpenReview={handleOpenReview}
              onOpenNewWorkItem={(projectId) => {
                setModalProjectId(projectId);
                setNewWorkItemModalOpen(true);
              }}
              onCreateProject={handleCreateProject}
            />
          )}

          {activeScreen === 'work-item' && (
            <WorkItemView
              project={activeProject}
              workItem={activeWorkItem}
              projectWorkItems={projectWorkItems}
              runs={workspace.runs}
              reviewers={workspace.reviewers}
              connection={workspace.connection}
              onSelectWorkItem={handleOpenWorkItem}
              onSaveWorkItem={handleSaveWorkItem}
              onApprovePlan={handleApprovePlan}
              onDraftWithGemini={handleDraftWithGemini}
              onOpenRun={(runId) => {
                setSelectedRunId(runId);
                setActiveScreen('run-details');
              }}
              onOpenReview={(runId) => {
                setSelectedRunId(runId);
                setActiveScreen('review');
              }}
              onOpenNewWorkItem={() => {
                setModalProjectId(activeProject?.id || workspace.projects[0]?.id || '');
                setNewWorkItemModalOpen(true);
              }}
            />
          )}

          {activeScreen === 'run-details' && (
            <RunDetailsView
              project={activeProject}
              workItem={activeWorkItem}
              run={activeRun}
              onOpenReview={() => setActiveScreen('review')}
              onBackToWorkItem={() => setActiveScreen('work-item')}
              onResumePausedRun={handleResumePausedRun}
            />
          )}

          {activeScreen === 'review' && (
            <ReviewView
              project={activeProject}
              workItem={activeWorkItem}
              run={activeRun}
              reviewers={workspace.reviewers}
              connection={workspace.connection}
              onRequestChanges={handleRequestChanges}
              onApproveRevision={handleApproveRevision}
              onMergePullRequest={handleMergePullRequest}
              onRunGeminiDiffReview={handleRunGeminiDiffReview}
              onOpenRunDetails={() => setActiveScreen('run-details')}
            />
          )}

          {activeScreen === 'connections' && (
            <ConnectionsView
              connection={workspace.connection}
              projects={workspace.projects}
              onSelectRepository={handleSelectRepository}
              onVerifyGitHub={handleVerifyGitHub}
              onResetDemoWorkspace={handleResetDemoWorkspace}
            />
          )}
        </main>
      </div>

      <WorkItemModal
        open={newWorkItemModalOpen}
        projects={workspace.projects}
        reviewers={workspace.reviewers}
        initialProjectId={modalProjectId}
        onClose={() => setNewWorkItemModalOpen(false)}
        onSubmit={handleCreateWorkItem}
      />
    </div>
  );
}

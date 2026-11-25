import type {
  AcceptanceCriterion,
  DeliveryRun,
  MissingInfoFlag,
  Project,
  ReviewFinding,
  WorkItem,
  WorkspaceSnapshot,
} from '../types/calder';

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' && data.error
        ? data.error
        : `Request failed (HTTP ${res.status})`
    );
  }
  return data as T;
}

export const api = {
  getWorkspace(): Promise<WorkspaceSnapshot> {
    return requestJson<WorkspaceSnapshot>('/api/workspace');
  },

  resetWorkspace(): Promise<WorkspaceSnapshot> {
    return requestJson<WorkspaceSnapshot>('/api/workspace/reset', {
      method: 'POST',
    });
  },

  createProject(payload: {
    name: string;
    clientName: string;
    repository: string;
    defaultBranch: string;
    stackSummary: string;
    description: string;
  }): Promise<{ project: Project; workspace: WorkspaceSnapshot }> {
    return requestJson('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createWorkItem(payload: {
    projectId: string;
    title?: string;
    requestText: string;
    assignedReviewer: string;
  }): Promise<{ workItem: WorkItem; workspace: WorkspaceSnapshot }> {
    return requestJson('/api/work-items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateWorkItem(
    id: string,
    payload: {
      title?: string;
      assignedReviewer?: string;
      acceptanceCriteria?: AcceptanceCriterion[];
      missingInfoFlags?: MissingInfoFlag[];
    }
  ): Promise<{ workItem: WorkItem; workspace: WorkspaceSnapshot }> {
    return requestJson(`/api/work-items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  approvePlan(
    workItemId: string
  ): Promise<{ run: DeliveryRun; workItem: WorkItem; workspace: WorkspaceSnapshot }> {
    return requestJson(
      `/api/work-items/${encodeURIComponent(workItemId)}/approve-plan`,
      { method: 'POST' }
    );
  },

  requestChanges(
    runId: string,
    payload: { comment: string; reviewer: string }
  ): Promise<{ run: DeliveryRun; workItem: WorkItem; workspace: WorkspaceSnapshot }> {
    return requestJson(`/api/runs/${encodeURIComponent(runId)}/request-changes`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  approveRevision(
    runId: string,
    payload: { reviewer: string; commitSha: string; comment?: string }
  ): Promise<{ run: DeliveryRun; workItem: WorkItem; workspace: WorkspaceSnapshot }> {
    return requestJson(`/api/runs/${encodeURIComponent(runId)}/approve-revision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  mergePullRequest(
    runId: string,
    payload: { confirmed: boolean; confirmedBy: string; commitSha: string }
  ): Promise<{ run: DeliveryRun; workItem: WorkItem; workspace: WorkspaceSnapshot }> {
    return requestJson(`/api/runs/${encodeURIComponent(runId)}/merge`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  resumePausedRun(
    runId: string,
    payload: { guidance: string }
  ): Promise<{ run: DeliveryRun; workItem: WorkItem; workspace: WorkspaceSnapshot }> {
    return requestJson(`/api/runs/${encodeURIComponent(runId)}/resume`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  selectRepository(
    repository: string
  ): Promise<{ workspace: WorkspaceSnapshot }> {
    return requestJson('/api/connections/repository', {
      method: 'POST',
      body: JSON.stringify({ repository }),
    });
  },

  verifyGitHub(): Promise<{ workspace: WorkspaceSnapshot }> {
    return requestJson('/api/connections/github/verify', {
      method: 'POST',
    });
  },

  draftCriteriaWithGemini(
    workItemId: string
  ): Promise<{ model: string; workItem: WorkItem; workspace: WorkspaceSnapshot }> {
    return requestJson('/api/gemini/draft-criteria', {
      method: 'POST',
      body: JSON.stringify({ workItemId }),
    });
  },

  reviewDiffWithGemini(
    runId: string
  ): Promise<{
    model: string;
    findings: ReviewFinding[];
    run: DeliveryRun;
    workspace: WorkspaceSnapshot;
  }> {
    return requestJson('/api/gemini/review-diff', {
      method: 'POST',
      body: JSON.stringify({ runId }),
    });
  },
};

import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  applyNewRevisionCommit,
  buildDeterministicSha,
  evaluateMergeGate,
  shortSha,
  validateProjectInput,
  validateWorkItemInput,
} from './src/lib/workflow';
import {
  buildInitialCriteriaAndFlags,
  buildSimulatedRun,
  deriveTitleFromRequest,
} from './src/server/demoEngine';
import {
  draftCriteriaWithGemini,
  reviewDiffWithGemini,
} from './src/server/geminiService';
import {
  loadWorkspace,
  resetWorkspaceToSeed,
  saveWorkspace,
} from './src/server/store';
import type {
  AcceptanceCriterion,
  DeliveryRun,
  Project,
  ReviewDecisionRecord,
  WorkItem,
} from './src/types/calder';

const PORT = 3000;

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // GET full persisted workspace state
  app.get('/api/workspace', (_req: Request, res: Response) => {
    const workspace = loadWorkspace();
    res.json(workspace);
  });

  // POST reset demo workspace to clean seed
  app.post('/api/workspace/reset', (_req: Request, res: Response) => {
    const workspace = resetWorkspaceToSeed();
    res.json(workspace);
  });

  // POST create a new project
  app.post('/api/projects', (req: Request, res: Response) => {
    const name = sanitizeString(req.body?.name, 100);
    const clientName = sanitizeString(req.body?.clientName, 100);
    const repository = sanitizeString(req.body?.repository, 140);
    const defaultBranch = sanitizeString(req.body?.defaultBranch || 'main', 60);
    const stackSummary = sanitizeString(
      req.body?.stackSummary || 'FastAPI · React · PostgreSQL',
      120
    );
    const description = sanitizeString(req.body?.description, 320);

    const validationError = validateProjectInput({
      name,
      clientName,
      repository,
      defaultBranch,
    });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const workspace = loadWorkspace();
    if (
      workspace.projects.some(
        (p) => p.repository.toLowerCase() === repository.toLowerCase()
      )
    ) {
      res
        .status(409)
        .json({ error: `Repository ${repository} is already registered.` });
      return;
    }

    const project: Project = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      clientName,
      repository,
      defaultBranch,
      stackSummary,
      description:
        description || `Delivery workspace for ${clientName} (${repository}).`,
      createdAt: new Date().toISOString(),
    };

    workspace.projects.unshift(project);
    const saved = saveWorkspace(workspace);
    res.status(201).json({ project, workspace: saved });
  });

  // POST submit a new work item
  app.post('/api/work-items', (req: Request, res: Response) => {
    const projectId = sanitizeString(req.body?.projectId, 80);
    const requestText = sanitizeString(req.body?.requestText, 2000);
    const explicitTitle = sanitizeString(req.body?.title, 120);
    const assignedReviewer = sanitizeString(
      req.body?.assignedReviewer || 'Priya Nair',
      80
    );
    const createdBy = sanitizeString(req.body?.createdBy || 'Hannah Reid', 80);

    const validationError = validateWorkItemInput({
      projectId,
      title: explicitTitle,
      requestText,
    });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const workspace = loadWorkspace();
    const project = workspace.projects.find((p) => p.id === projectId);
    if (!project) {
      res.status(404).json({ error: 'Selected project was not found.' });
      return;
    }

    const maxKeyNum = workspace.workItems.reduce((acc, item) => {
      const m = /^CW-(\d+)$/.exec(item.key);
      return m ? Math.max(acc, Number.parseInt(m[1], 10)) : acc;
    }, 108);
    const nextKey = `CW-${maxKeyNum + 1}`;
    const nowIso = new Date().toISOString();
    const { criteria, flags } = buildInitialCriteriaAndFlags(requestText);

    const workItem: WorkItem = {
      id: `wi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      key: nextKey,
      projectId: project.id,
      title: explicitTitle || deriveTitleFromRequest(requestText),
      requestText,
      status: 'draft_plan',
      assignedReviewer,
      createdBy,
      createdAt: nowIso,
      updatedAt: nowIso,
      planApprovedAt: null,
      acceptanceCriteria: criteria,
      missingInfoFlags: flags,
      runIds: [],
      latestRunId: null,
    };

    workspace.workItems.unshift(workItem);
    const saved = saveWorkspace(workspace);
    res.status(201).json({ workItem, workspace: saved });
  });

  // PATCH update work item (editable acceptance criteria, reviewer, missing info resolution)
  app.patch('/api/work-items/:id', (req: Request, res: Response) => {
    const workspace = loadWorkspace();
    const workItem = workspace.workItems.find((w) => w.id === req.params.id);
    if (!workItem) {
      res.status(404).json({ error: 'Work item not found.' });
      return;
    }

    if (typeof req.body?.assignedReviewer === 'string') {
      const rev = sanitizeString(req.body.assignedReviewer, 80);
      if (rev) workItem.assignedReviewer = rev;
    }

    if (typeof req.body?.title === 'string') {
      const title = sanitizeString(req.body.title, 140);
      if (title) workItem.title = title;
    }

    if (Array.isArray(req.body?.acceptanceCriteria)) {
      const allowedCats = new Set(['functional', 'validation', 'ui', 'testing']);
      const cleaned: AcceptanceCriterion[] = req.body.acceptanceCriteria
        .filter((c: unknown) => c && typeof c === 'object')
        .map((c: Record<string, unknown>, idx: number) => ({
          id: sanitizeString(c.id, 60) || `ac-${Date.now()}-${idx}`,
          text: sanitizeString(c.text, 500),
          category: allowedCats.has(String(c.category))
            ? (String(c.category) as AcceptanceCriterion['category'])
            : 'functional',
          verified: Boolean(c.verified),
        }))
        .filter((c: AcceptanceCriterion) => c.text.length > 0);
      workItem.acceptanceCriteria = cleaned;
    }

    if (Array.isArray(req.body?.missingInfoFlags)) {
      workItem.missingInfoFlags = req.body.missingInfoFlags
        .filter((f: unknown): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
        .map((f: Record<string, unknown>, idx: number) => ({
          id: sanitizeString(f.id, 60) || `flag-${Date.now()}-${idx}`,
          question: sanitizeString(f.question, 400),
          severity:
            f.severity === 'blocking'
              ? ('blocking' as const)
              : ('clarification' as const),
          resolution:
            typeof f.resolution === 'string'
              ? sanitizeString(f.resolution, 400)
              : undefined,
        }))
        .filter((f: { question: string }) => f.question.length > 0);
    }

    workItem.updatedAt = new Date().toISOString();
    const saved = saveWorkspace(workspace);
    res.json({ workItem, workspace: saved });
  });

  // POST approve plan & start 8-agent LangGraph delivery run
  app.post('/api/work-items/:id/approve-plan', (req: Request, res: Response) => {
    const workspace = loadWorkspace();
    const workItem = workspace.workItems.find((w) => w.id === req.params.id);
    if (!workItem) {
      res.status(404).json({ error: 'Work item not found.' });
      return;
    }

    if (workItem.acceptanceCriteria.length === 0) {
      res.status(400).json({
        error: 'Add at least one acceptance criterion before approving the plan.',
      });
      return;
    }

    const project = workspace.projects.find((p) => p.id === workItem.projectId);
    if (!project) {
      res.status(404).json({ error: 'Parent project not found.' });
      return;
    }

    const nowIso = new Date().toISOString();
    workItem.planApprovedAt = nowIso;
    workItem.updatedAt = nowIso;

    const existingRuns = workspace.runs.filter(
      (r) => r.workItemId === workItem.id
    );
    const nextRunNumber = existingRuns.length + 1;
    const maxPrNum = workspace.runs.reduce(
      (acc, r) => (r.pullRequest ? Math.max(acc, r.pullRequest.number) : acc),
      184
    );

    const newRun = buildSimulatedRun({
      project,
      workItem,
      runNumber: nextRunNumber,
      revisionNumber: 1,
      prNumber: maxPrNum + 1,
    });

    workItem.acceptanceCriteria = workItem.acceptanceCriteria.map((c) => ({
      ...c,
      verified: true,
    }));
    workItem.status = 'needs_review';
    workItem.runIds.push(newRun.id);
    workItem.latestRunId = newRun.id;

    workspace.runs.unshift(newRun);
    const saved = saveWorkspace(workspace);
    res.status(201).json({ run: newRun, workItem, workspace: saved });
  });

  // POST request changes -> creates a new revision commit SHA, invalidates prior approval, updates diff & tests
  app.post('/api/runs/:id/request-changes', (req: Request, res: Response) => {
    const comment = sanitizeString(req.body?.comment, 1000);
    const reviewer = sanitizeString(req.body?.reviewer, 80);

    if (comment.length < 6) {
      res.status(400).json({
        error:
          'Provide specific feedback (at least 6 characters) when requesting changes.',
      });
      return;
    }

    const workspace = loadWorkspace();
    const runIndex = workspace.runs.findIndex((r) => r.id === req.params.id);
    if (runIndex === -1) {
      res.status(404).json({ error: 'Delivery run not found.' });
      return;
    }

    const currentRun = workspace.runs[runIndex];
    if (currentRun.pullRequest?.status === 'merged') {
      res
        .status(409)
        .json({ error: 'Cannot request changes on an already merged pull request.' });
      return;
    }

    const workItem = workspace.workItems.find(
      (w) => w.id === currentRun.workItemId
    );
    const project = workItem
      ? workspace.projects.find((p) => p.id === workItem.projectId)
      : undefined;
    if (!workItem || !project) {
      res.status(404).json({ error: 'Associated work item or project not found.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const activeReviewer = reviewer || workItem.assignedReviewer;
    const nextRevision = currentRun.revisionNumber + 1;

    const regenerated = buildSimulatedRun({
      project,
      workItem,
      runNumber: currentRun.runNumber,
      revisionNumber: nextRevision,
      prNumber: currentRun.pullRequest?.number ?? 185,
      revisionNote: comment,
    });

    const changeRequestRecord: ReviewDecisionRecord = {
      id: `rev-cr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'changes_requested',
      reviewer: activeReviewer,
      commitSha: currentRun.commitSha,
      comment,
      createdAt: nowIso,
      simulated: currentRun.simulated,
    };

    const existingPr = currentRun.pullRequest ?? regenerated.pullRequest!;
    const { updatedPr, invalidationRecord } = applyNewRevisionCommit(
      existingPr,
      regenerated.commitSha,
      nowIso
    );

    const updatedHistory = [
      ...currentRun.reviewHistory,
      changeRequestRecord,
      ...(invalidationRecord ? [invalidationRecord] : []),
    ];

    const updatedRun: DeliveryRun = {
      ...regenerated,
      id: currentRun.id,
      createdAt: currentRun.createdAt,
      updatedAt: nowIso,
      status: 'needs_review',
      testRuns: [...currentRun.testRuns, ...regenerated.testRuns],
      reviewHistory: updatedHistory,
      pullRequest: updatedPr,
    };

    workspace.runs[runIndex] = updatedRun;
    workItem.status = 'needs_review';
    workItem.updatedAt = nowIso;

    const saved = saveWorkspace(workspace);
    res.json({ run: updatedRun, workItem, workspace: saved });
  });

  // POST approve exact revision SHA
  app.post('/api/runs/:id/approve-revision', (req: Request, res: Response) => {
    const reviewer = sanitizeString(req.body?.reviewer, 80);
    const comment = sanitizeString(
      req.body?.comment || 'Revision verified against acceptance criteria and test output.',
      600
    );
    const expectedSha = sanitizeString(req.body?.commitSha, 64);

    const workspace = loadWorkspace();
    const run = workspace.runs.find((r) => r.id === req.params.id);
    if (!run || !run.pullRequest) {
      res.status(404).json({ error: 'Delivery run or pull request not found.' });
      return;
    }

    if (expectedSha && expectedSha !== run.commitSha) {
      res.status(409).json({
        error: `Revision mismatch: expected ${shortSha(expectedSha)}, but current head is ${shortSha(run.commitSha)}. Refresh and review the latest commit.`,
      });
      return;
    }

    const latestTest = run.testRuns[run.testRuns.length - 1];
    if (!latestTest || latestTest.exitCode !== 0) {
      res.status(409).json({
        error:
          'Cannot approve revision while required tests are failing (non-zero exit code).',
      });
      return;
    }

    const workItem = workspace.workItems.find((w) => w.id === run.workItemId);
    const activeReviewer = reviewer || workItem?.assignedReviewer || 'Priya Nair';
    const nowIso = new Date().toISOString();

    run.pullRequest.approvedSha = run.commitSha;
    run.pullRequest.approvedBy = activeReviewer;
    run.pullRequest.approvedAt = nowIso;
    run.pullRequest.isDraft = false;
    run.status = 'approved';
    run.updatedAt = nowIso;

    run.reviewHistory.push({
      id: `rev-app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'approved',
      reviewer: activeReviewer,
      commitSha: run.commitSha,
      comment,
      createdAt: nowIso,
      simulated: run.simulated,
    });

    if (workItem) {
      workItem.status = 'approved';
      workItem.updatedAt = nowIso;
    }

    const saved = saveWorkspace(workspace);
    res.json({ run, workItem, workspace: saved });
  });

  // POST separate explicit merge confirmation action
  app.post('/api/runs/:id/merge', (req: Request, res: Response) => {
    const confirmedBy = sanitizeString(req.body?.confirmedBy, 80);
    const expectedSha = sanitizeString(req.body?.commitSha, 64);
    const explicitConfirm = Boolean(req.body?.confirmed);

    if (!explicitConfirm) {
      res.status(400).json({
        error: 'Explicit merge confirmation is required before merging.',
      });
      return;
    }

    const workspace = loadWorkspace();
    const run = workspace.runs.find((r) => r.id === req.params.id);
    if (!run || !run.pullRequest) {
      res.status(404).json({ error: 'Delivery run or pull request not found.' });
      return;
    }

    if (expectedSha && expectedSha !== run.commitSha) {
      res.status(409).json({
        error: `Merge blocked: head commit changed to ${shortSha(run.commitSha)}. Re-approve the latest revision first.`,
      });
      return;
    }

    const gate = evaluateMergeGate(run);
    if (!gate.canMerge) {
      res.status(409).json({
        error: gate.reasons[0] || 'Merge requirements are not met.',
        reasons: gate.reasons,
      });
      return;
    }

    const workItem = workspace.workItems.find((w) => w.id === run.workItemId);
    const nowIso = new Date().toISOString();
    const merger = confirmedBy || run.pullRequest.approvedBy || 'Priya Nair';

    run.pullRequest.status = 'merged';
    run.pullRequest.mergedBy = merger;
    run.pullRequest.mergedAt = nowIso;
    run.pullRequest.mergeCommitSha = buildDeterministicSha(
      `merge:${run.pullRequest.number}:${run.commitSha}:${nowIso}`
    );
    run.status = 'merged';
    run.updatedAt = nowIso;

    if (workItem) {
      workItem.status = 'merged';
      workItem.updatedAt = nowIso;
    }

    const saved = saveWorkspace(workspace);
    res.json({ run, workItem, workspace: saved });
  });

  // POST resume a paused run with human guidance
  app.post('/api/runs/:id/resume', (req: Request, res: Response) => {
    const guidance = sanitizeString(req.body?.guidance, 800);
    if (guidance.length < 6) {
      res.status(400).json({
        error: 'Provide clear guidance before resuming a paused run.',
      });
      return;
    }

    const workspace = loadWorkspace();
    const runIndex = workspace.runs.findIndex((r) => r.id === req.params.id);
    if (runIndex === -1) {
      res.status(404).json({ error: 'Delivery run not found.' });
      return;
    }

    const currentRun = workspace.runs[runIndex];
    const workItem = workspace.workItems.find(
      (w) => w.id === currentRun.workItemId
    );
    const project = workItem
      ? workspace.projects.find((p) => p.id === workItem.projectId)
      : undefined;
    if (!workItem || !project) {
      res.status(404).json({ error: 'Work item or project not found.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const rebuilt = buildSimulatedRun({
      project,
      workItem,
      runNumber: currentRun.runNumber,
      revisionNumber: currentRun.revisionNumber + 1,
      prNumber: currentRun.pullRequest?.number ?? 91,
      revisionNote: `Human decision guidance: ${guidance}`,
    });

    const updatedRun: DeliveryRun = {
      ...rebuilt,
      id: currentRun.id,
      createdAt: currentRun.createdAt,
      updatedAt: nowIso,
      status: 'needs_review',
      pauseReason: undefined,
      testRuns: [...currentRun.testRuns, ...rebuilt.testRuns],
      reviewHistory: [
        ...currentRun.reviewHistory,
        {
          id: `rev-res-${Date.now()}`,
          action: 'changes_requested',
          reviewer: workItem.assignedReviewer,
          commitSha: currentRun.commitSha,
          comment: `Resumed from pause: ${guidance}`,
          createdAt: nowIso,
          simulated: currentRun.simulated,
        },
      ],
    };

    workspace.runs[runIndex] = updatedRun;
    workItem.status = 'needs_review';
    workItem.updatedAt = nowIso;

    const saved = saveWorkspace(workspace);
    res.json({ run: updatedRun, workItem, workspace: saved });
  });

  // POST update selected repository in Connections
  app.post('/api/connections/repository', (req: Request, res: Response) => {
    const repository = sanitizeString(req.body?.repository, 140);
    if (!repository || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repository)) {
      res.status(400).json({ error: 'Invalid repository format (owner/repo).' });
      return;
    }
    const workspace = loadWorkspace();
    workspace.connection.selectedRepository = repository;
    workspace.connection.lastCheckedAt = new Date().toISOString();
    const saved = saveWorkspace(workspace);
    res.json({ connection: saved.connection, workspace: saved });
  });

  // POST verify GitHub server-side token connectivity
  app.post('/api/connections/github/verify', async (_req: Request, res: Response) => {
    const workspace = loadWorkspace();
    const token = process.env.GITHUB_TOKEN?.trim();
    const nowIso = new Date().toISOString();

    if (!token) {
      workspace.connection.githubConnected = false;
      workspace.connection.githubAccount = null;
      workspace.connection.mode = 'demo';
      workspace.connection.lastCheckedAt = nowIso;
      workspace.connection.statusMessage =
        'GITHUB_TOKEN is not set on the server. Running in Demo workspace mode with simulated GitHub operations.';
      const saved = saveWorkspace(workspace);
      res.json({ connection: saved.connection, workspace: saved });
      return;
    }

    try {
      const apiBase =
        process.env.GITHUB_API_BASE?.replace(/\/+$/, '') ||
        'https://api.github.com';
      const ghRes = await fetch(`${apiBase}/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'calder-works',
        },
      });
      if (!ghRes.ok) {
        workspace.connection.githubConnected = false;
        workspace.connection.githubAccount = null;
        workspace.connection.mode = 'demo';
        workspace.connection.lastCheckedAt = nowIso;
        workspace.connection.statusMessage = `GitHub verification failed (HTTP ${ghRes.status}). Check server GITHUB_TOKEN permissions.`;
        const saved = saveWorkspace(workspace);
        res.status(502).json({
          error: workspace.connection.statusMessage,
          connection: saved.connection,
          workspace: saved,
        });
        return;
      }

      const data = (await ghRes.json()) as { login?: string };
      workspace.connection.githubConnected = true;
      workspace.connection.githubAccount = data.login || 'authenticated-user';
      workspace.connection.mode =
        process.env.CALDER_WORKSPACE_MODE === 'connected' ? 'connected' : 'demo';
      workspace.connection.lastCheckedAt = nowIso;
      workspace.connection.statusMessage = `Verified GitHub credentials for @${workspace.connection.githubAccount} on the server.`;
      const saved = saveWorkspace(workspace);
      res.json({ connection: saved.connection, workspace: saved });
    } catch (err) {
      workspace.connection.githubConnected = false;
      workspace.connection.lastCheckedAt = nowIso;
      workspace.connection.statusMessage =
        'Unable to reach GitHub API from this environment. Continuing in Demo workspace mode.';
      const saved = saveWorkspace(workspace);
      res.status(502).json({
        error: err instanceof Error ? err.message : 'GitHub check failed.',
        connection: saved.connection,
        workspace: saved,
      });
    }
  });

  // POST live server-side Gemini Requirements Analyst drafting
  app.post('/api/gemini/draft-criteria', async (req: Request, res: Response) => {
    const workItemId = sanitizeString(req.body?.workItemId, 80);
    const workspace = loadWorkspace();
    const workItem = workspace.workItems.find((w) => w.id === workItemId);
    if (!workItem) {
      res.status(404).json({ error: 'Work item not found.' });
      return;
    }
    const project = workspace.projects.find((p) => p.id === workItem.projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found.' });
      return;
    }

    try {
      const result = await draftCriteriaWithGemini({
        requestText: workItem.requestText,
        projectName: project.name,
        repository: project.repository,
        stackSummary: project.stackSummary,
      });

      if (result.criteria.length > 0) {
        workItem.acceptanceCriteria = result.criteria;
      }
      if (result.flags.length > 0) {
        workItem.missingInfoFlags = result.flags;
      }
      workItem.updatedAt = new Date().toISOString();
      const saved = saveWorkspace(workspace);
      res.json({
        model: result.model,
        workItem,
        workspace: saved,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gemini request failed.';
      res.status(502).json({ error: message });
    }
  });

  // POST live server-side Gemini Code Reviewer analysis
  app.post('/api/gemini/review-diff', async (req: Request, res: Response) => {
    const runId = sanitizeString(req.body?.runId, 80);
    const workspace = loadWorkspace();
    const run = workspace.runs.find((r) => r.id === runId);
    if (!run) {
      res.status(404).json({ error: 'Delivery run not found.' });
      return;
    }
    const workItem = workspace.workItems.find((w) => w.id === run.workItemId);
    if (!workItem) {
      res.status(404).json({ error: 'Work item not found.' });
      return;
    }

    try {
      const result = await reviewDiffWithGemini({
        requestText: workItem.requestText,
        criteria: workItem.acceptanceCriteria,
        changedFiles: run.changedFiles,
      });

      if (result.findings.length > 0) {
        run.findings = [...result.findings, ...run.findings];
      }
      run.updatedAt = new Date().toISOString();
      const saved = saveWorkspace(workspace);
      res.json({
        model: result.model,
        findings: result.findings,
        run,
        workspace: saved,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gemini diff review failed.';
      res.status(502).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Calder Works listening on http://0.0.0.0:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start Calder Works server:', err);
  process.exit(1);
});

export type WorkspaceMode = 'demo' | 'connected';

export type ScreenId =
  | 'projects'
  | 'work-item'
  | 'run-details'
  | 'review'
  | 'connections';

export type WorkItemStatus =
  | 'draft_plan'
  | 'running'
  | 'paused_human_decision'
  | 'needs_review'
  | 'changes_requested'
  | 'approved'
  | 'merged';

export type AgentRole =
  | 'requirements_analyst'
  | 'architect'
  | 'python_engineer'
  | 'react_engineer'
  | 'test_engineer'
  | 'bug_detection_agent'
  | 'code_reviewer'
  | 'documentation_writer';

export type AgentStepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'awaiting_approval';

export interface AcceptanceCriterion {
  id: string;
  text: string;
  category: 'functional' | 'validation' | 'ui' | 'testing';
  verified: boolean;
}

export interface MissingInfoFlag {
  id: string;
  question: string;
  severity: 'clarification' | 'blocking';
  resolution?: string;
}

export interface AgentStepArtifact {
  kind:
    | 'requirements'
    | 'architecture'
    | 'code_changes'
    | 'test_report'
    | 'bug_report'
    | 'code_review'
    | 'documentation';
  title: string;
  summary: string;
  content: string;
  structuredMeta?: Record<string, string>;
}

export interface AgentStep {
  id: string;
  role: AgentRole;
  label: string;
  stageOrder: number;
  parallelGroup?: 'implementation';
  status: AgentStepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  inputsSummary: string;
  outputsSummary: string;
  errorMessage?: string;
  artifact?: AgentStepArtifact;
}

export interface ChangedFile {
  path: string;
  layer: 'backend' | 'frontend' | 'tests' | 'docs';
  changeType: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  language: 'python' | 'typescript' | 'sql' | 'markdown';
  diff: string;
}

export interface TestCaseResult {
  id: string;
  name: string;
  file: string;
  status: 'passed' | 'failed';
  durationMs: number;
  errorDetail?: string;
}

export interface TestRunRecord {
  id: string;
  attemptNumber: number;
  runner: string;
  command: string;
  exitCode: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  executedAt: string;
  simulated: boolean;
  cases: TestCaseResult[];
  rawOutput: string;
}

export interface ReviewFinding {
  id: string;
  filePath: string;
  line: number;
  severity: 'blocker' | 'suggestion' | 'note';
  author: string;
  message: string;
  resolved: boolean;
}

export interface ReviewDecisionRecord {
  id: string;
  action: 'changes_requested' | 'approved' | 'approval_invalidated';
  reviewer: string;
  commitSha: string;
  comment: string;
  createdAt: string;
  simulated: boolean;
}

export interface PullRequestRecord {
  number: number;
  title: string;
  branchName: string;
  baseBranch: string;
  url: string;
  isDraft: boolean;
  headSha: string;
  approvedSha: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  status: 'open' | 'merged' | 'closed';
  mergeCommitSha: string | null;
  mergedBy: string | null;
  mergedAt: string | null;
  simulated: boolean;
}

export interface DeliveryRun {
  id: string;
  workItemId: string;
  runNumber: number;
  revisionNumber: number;
  commitSha: string;
  status:
    | 'awaiting_plan_approval'
    | 'running'
    | 'paused_human_decision'
    | 'needs_review'
    | 'changes_requested'
    | 'approved'
    | 'merged'
    | 'failed';
  simulated: boolean;
  createdAt: string;
  updatedAt: string;
  autoCorrectionAttempts: number;
  maxAutoCorrectionAttempts: number;
  pauseReason?: string;
  steps: AgentStep[];
  changedFiles: ChangedFile[];
  testRuns: TestRunRecord[];
  findings: ReviewFinding[];
  reviewHistory: ReviewDecisionRecord[];
  pullRequest: PullRequestRecord | null;
}

export interface WorkItem {
  id: string;
  key: string;
  projectId: string;
  title: string;
  requestText: string;
  status: WorkItemStatus;
  assignedReviewer: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  planApprovedAt: string | null;
  acceptanceCriteria: AcceptanceCriterion[];
  missingInfoFlags: MissingInfoFlag[];
  runIds: string[];
  latestRunId: string | null;
}

export interface Project {
  id: string;
  name: string;
  clientName: string;
  repository: string;
  defaultBranch: string;
  stackSummary: string;
  description: string;
  createdAt: string;
}

export interface ConnectionState {
  mode: WorkspaceMode;
  githubConnected: boolean;
  githubAccount: string | null;
  selectedRepository: string;
  geminiConfigured: boolean;
  dockerSandboxAvailable: boolean;
  postgresConnected: boolean;
  lastCheckedAt: string;
  statusMessage: string;
}

export interface WorkspaceSnapshot {
  projects: Project[];
  workItems: WorkItem[];
  runs: DeliveryRun[];
  connection: ConnectionState;
  reviewers: string[];
}

export interface ParsedDiffLine {
  type: 'meta' | 'hunk' | 'context' | 'add' | 'del';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

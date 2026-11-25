import type { AgentStepStatus, WorkItemStatus } from '../types/calder';

const WORK_ITEM_STATUS_MAP: Record<
  WorkItemStatus | 'awaiting_plan_approval' | 'failed',
  { label: string; className: string }
> = {
  draft_plan: {
    label: 'Plan awaiting approval',
    className: 'text-[#1E40AF]',
  },
  awaiting_plan_approval: {
    label: 'Plan awaiting approval',
    className: 'text-[#1E40AF]',
  },
  running: {
    label: 'Running',
    className: 'text-[#1E40AF]',
  },
  paused_human_decision: {
    label: 'Paused — human decision',
    className: 'text-[#B91C1C]',
  },
  needs_review: {
    label: 'Needs review',
    className: 'text-[#B45309]',
  },
  changes_requested: {
    label: 'Changes requested',
    className: 'text-[#B45309]',
  },
  approved: {
    label: 'Approved',
    className: 'text-[#15803D]',
  },
  merged: {
    label: 'Merged',
    className: 'text-[#15803D]',
  },
  failed: {
    label: 'Failed',
    className: 'text-[#B91C1C]',
  },
};

export function WorkStatusText({
  status,
}: {
  status: WorkItemStatus | 'awaiting_plan_approval' | 'failed';
}) {
  const entry = WORK_ITEM_STATUS_MAP[status] ?? {
    label: status,
    className: 'text-[#5C6066]',
  };
  return (
    <span
      className={`text-xs font-semibold whitespace-nowrap ${entry.className}`}
    >
      {entry.label}
    </span>
  );
}

const STEP_STATUS_MAP: Record<
  AgentStepStatus,
  { label: string; className: string }
> = {
  pending: { label: 'Queued', className: 'text-[#5C6066]' },
  running: { label: 'Running', className: 'text-[#1E40AF]' },
  completed: { label: 'Completed', className: 'text-[#15803D]' },
  failed: { label: 'Failed', className: 'text-[#B91C1C]' },
  skipped: { label: 'Skipped', className: 'text-[#6B7280]' },
  awaiting_approval: { label: 'Awaiting plan', className: 'text-[#B45309]' },
};

export function StepStatusText({ status }: { status: AgentStepStatus }) {
  const entry = STEP_STATUS_MAP[status];
  return (
    <span
      className={`text-xs font-medium whitespace-nowrap ${entry.className}`}
    >
      {entry.label}
    </span>
  );
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

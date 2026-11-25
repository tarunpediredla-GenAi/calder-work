import { Menu, Plus } from 'lucide-react';
import type {
  ConnectionState,
  Project,
  ScreenId,
  WorkItem,
} from '../types/calder';

interface TopBarProps {
  activeScreen: ScreenId;
  project: Project | null;
  workItem: WorkItem | null;
  connection: ConnectionState;
  onOpenMobileNav: () => void;
  onOpenNewWorkItem: () => void;
}

const SCREEN_TITLES: Record<ScreenId, string> = {
  projects: 'Projects',
  'work-item': 'Work item',
  'run-details': 'Run details',
  review: 'Review',
  connections: 'Connections',
};

export function TopBar({
  activeScreen,
  project,
  workItem,
  connection,
  onOpenMobileNav,
  onOpenNewWorkItem,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-6 border-b border-[#E5E1D8] bg-white px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileNav}
          aria-label="Open navigation menu"
          className="rounded border border-[#E5E1D8] p-1.5 text-[#1A1C1E] hover:bg-[#F4F2EC] lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-2 text-sm text-[#5C6066]"
        >
          <span className="truncate font-medium text-[#1A1C1E]">
            {project ? project.name : 'Calder Works'}
          </span>
          {workItem && activeScreen !== 'projects' && activeScreen !== 'connections' && (
            <>
              <span aria-hidden="true" className="text-[#B8B2A5]">
                /
              </span>
              <span className="font-mono text-xs font-medium text-[#1A1C1E] whitespace-nowrap">
                {workItem.key}
              </span>
            </>
          )}
          <span aria-hidden="true" className="text-[#B8B2A5]">
            /
          </span>
          <span className="truncate whitespace-nowrap text-[#5C6066]">
            {SCREEN_TITLES[activeScreen]}
          </span>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <span className="hidden text-xs text-[#5C6066] sm:inline whitespace-nowrap">
          {connection.mode === 'connected'
            ? 'Connected mode'
            : 'Demo workspace (simulated)'}
        </span>
        <button
          type="button"
          onClick={onOpenNewWorkItem}
          className="inline-flex items-center gap-1.5 rounded bg-[#1E40AF] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#1E3A8A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E40AF] focus-visible:ring-offset-2 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>New work item</span>
        </button>
      </div>
    </header>
  );
}

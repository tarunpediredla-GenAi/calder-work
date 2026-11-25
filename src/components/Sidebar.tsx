import {
  FileDiff,
  FolderGit2,
  GitBranch,
  ListChecks,
  Plug,
  X,
} from 'lucide-react';
import type {
  ConnectionState,
  Project,
  ScreenId,
  WorkItem,
} from '../types/calder';

interface SidebarProps {
  activeScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
  projects: Project[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  activeWorkItem: WorkItem | null;
  connection: ConnectionState;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: ScreenId;
  label: string;
  icon: typeof FolderGit2;
}> = [
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'work-item', label: 'Work item', icon: ListChecks },
  { id: 'run-details', label: 'Run details', icon: GitBranch },
  { id: 'review', label: 'Review', icon: FileDiff },
  { id: 'connections', label: 'Connections', icon: Plug },
];

export function Sidebar({
  activeScreen,
  onSelectScreen,
  projects,
  selectedProjectId,
  onSelectProject,
  activeWorkItem,
  connection,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const navContent = (
    <aside
      aria-label="Workspace navigation"
      className="flex h-full w-[244px] shrink-0 flex-col bg-[#1C1F24] text-[#E8E6E1]"
    >
      <div className="flex h-14 items-center justify-between border-b border-[#2C313A] px-5">
        <button
          type="button"
          onClick={() => {
            onSelectScreen('projects');
            onCloseMobile();
          }}
          className="text-left font-semibold tracking-tight text-white whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60A5FA]"
        >
          Calder Works
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="rounded p-1 text-[#9CA3AF] hover:bg-[#2A2F38] hover:text-white lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-[#2C313A] px-4 py-3.5">
        <label
          htmlFor="sidebar-project-select"
          className="mb-1.5 block text-xs font-medium text-[#9CA3AF]"
        >
          Active project
        </label>
        <select
          id="sidebar-project-select"
          value={selectedProjectId}
          onChange={(e) => onSelectProject(e.target.value)}
          className="w-full rounded border border-[#343A46] bg-[#252A32] px-2.5 py-1.5 text-sm text-[#F3F2EE] focus:border-[#60A5FA] focus:outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectScreen(item.id);
                onCloseMobile();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#2D333D] text-white'
                  : 'text-[#C2C6CE] hover:bg-[#252A32] hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {activeWorkItem && (
        <div className="border-t border-[#2C313A] px-4 py-3 text-xs">
          <div className="text-[#9CA3AF]">Selected work item</div>
          <div className="mt-1 truncate font-mono text-[#E8E6E1]">
            {activeWorkItem.key}
          </div>
          <div className="mt-0.5 truncate text-[#B8BCC4]">
            {activeWorkItem.title}
          </div>
        </div>
      )}

      <div className="border-t border-[#2C313A] px-4 py-3.5 text-xs">
        <div className="font-medium text-[#F3F2EE]">
          {connection.mode === 'connected'
            ? 'Connected mode'
            : 'Demo workspace'}
        </div>
        <p className="mt-1 leading-relaxed text-[#9CA3AF]">
          {connection.mode === 'connected'
            ? `GitHub · ${connection.selectedRepository}`
            : 'Runs and GitHub actions are simulated and saved locally.'}
        </p>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden lg:block lg:h-screen lg:sticky lg:top-0">
        {navContent}
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="relative z-10 h-full">{navContent}</div>
          <button
            type="button"
            aria-label="Dismiss navigation overlay"
            onClick={onCloseMobile}
            className="flex-1 bg-black/45"
          />
        </div>
      )}
    </>
  );
}

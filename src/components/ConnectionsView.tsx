import { useState } from 'react';
import { Check, Copy, RefreshCw, RotateCcw } from 'lucide-react';
import type { ConnectionState, Project } from '../types/calder';
import { formatShortDate } from './StatusLabel';

interface ConnectionsViewProps {
  connection: ConnectionState;
  projects: Project[];
  onSelectRepository: (repo: string) => Promise<void>;
  onVerifyGitHub: () => Promise<void>;
  onResetDemoWorkspace: () => Promise<void>;
}

const LOCAL_SETUP_COMMANDS = `# 1. Copy env template & set server-only keys
cp .env.example .env
# Set GEMINI_API_KEY & GITHUB_TOKEN in .env

# 2. Build isolated non-root test sandbox
docker compose --profile build-only build sandbox-image

# 3. Start PostgreSQL + FastAPI LangGraph API
docker compose up --build

# 4. Run frontend in local connected mode
npm install
CALDER_WORKSPACE_MODE=connected npm run dev`;

export function ConnectionsView({
  connection,
  projects,
  onSelectRepository,
  onVerifyGitHub,
  onResetDemoWorkspace,
}: ConnectionsViewProps) {
  const [verifying, setVerifying] = useState(false);
  const [updatingRepo, setUpdatingRepo] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify() {
    setVerifying(true);
    setNotice(null);
    setError(null);
    try {
      await onVerifyGitHub();
      setNotice('Server-side GitHub connection check completed.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'GitHub connection check failed.'
      );
    } finally {
      setVerifying(false);
    }
  }

  async function handleRepoChange(repo: string) {
    setUpdatingRepo(true);
    setNotice(null);
    setError(null);
    try {
      await onSelectRepository(repo);
      setNotice(`Selected repository updated to ${repo}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update repository.'
      );
    } finally {
      setUpdatingRepo(false);
    }
  }

  async function handleCopyCommands() {
    try {
      await navigator.clipboard.writeText(LOCAL_SETUP_COMMANDS);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard access unavailable in this browser context.');
    }
  }

  async function handleReset() {
    setResetting(true);
    setNotice(null);
    setError(null);
    try {
      await onResetDemoWorkspace();
      setNotice('Demo workspace restored to initial seed data.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-6 p-5 lg:p-8">
      <div className="border-b border-[#E5E1D8] pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1A1C1E]">
          Connections
        </h1>
        <p className="mt-1 text-sm text-[#5C6066]">
          Workspace runtime mode, GitHub repository authorization, and local
          connected deployment instructions.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]"
        >
          {error}
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="rounded border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3 text-sm text-[#166534]"
        >
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="space-y-5 rounded border border-[#E5E1D8] bg-white p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#1A1C1E]">
                Workspace mode &amp; GitHub integration
              </h2>
              <p className="mt-0.5 text-xs text-[#5C6066]">
                All tokens and model API keys stay exclusively on the server.
              </p>
            </div>
            <span
              className={`text-xs font-semibold ${
                connection.mode === 'connected'
                  ? 'text-[#15803D]'
                  : 'text-[#B45309]'
              }`}
            >
              {connection.mode === 'connected'
                ? 'Connected mode'
                : 'Demo workspace'}
            </span>
          </div>

          <p className="rounded border border-[#ECE9E1] bg-[#FAF9F6] px-3.5 py-3 text-xs leading-relaxed text-[#2C3036]">
            {connection.statusMessage}
          </p>

          <dl className="divide-y divide-[#ECE9E1] text-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <dt className="text-[#5C6066]">GitHub authorization</dt>
              <dd className="text-right font-mono text-xs text-[#1A1C1E]">
                {connection.githubConnected
                  ? `Connected (${connection.githubAccount})`
                  : 'Not configured on server (simulated in Demo workspace)'}
              </dd>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <dt className="text-[#5C6066]">
                <label htmlFor="connections-repo-select">
                  Selected repository
                </label>
              </dt>
              <dd>
                <select
                  id="connections-repo-select"
                  disabled={updatingRepo}
                  value={connection.selectedRepository}
                  onChange={(e) => handleRepoChange(e.target.value)}
                  className="rounded border border-[#D4CFC4] bg-white px-2.5 py-1.5 font-mono text-xs text-[#1A1C1E] focus:border-[#1E40AF] focus:outline-none"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.repository}>
                      {p.repository} ({p.defaultBranch})
                    </option>
                  ))}
                </select>
              </dd>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <dt className="text-[#5C6066]">Server Gemini API</dt>
              <dd className="text-right font-mono text-xs text-[#1A1C1E]">
                {connection.geminiConfigured
                  ? 'Configured (server-side GEMINI_API_KEY)'
                  : 'Not set in environment (Demo mode active)'}
              </dd>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <dt className="text-[#5C6066]">Isolated Docker test sandbox</dt>
              <dd className="text-right font-mono text-xs text-[#1A1C1E]">
                {connection.dockerSandboxAvailable
                  ? 'Docker daemon reachable (--network=none)'
                  : 'Unavailable in preview (recorded outputs used)'}
              </dd>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <dt className="text-[#5C6066]">PostgreSQL store</dt>
              <dd className="text-right font-mono text-xs text-[#1A1C1E]">
                {connection.postgresConnected
                  ? 'Connected via FastAPI SQLAlchemy'
                  : 'File-backed preview store (data/calder-store.json)'}
              </dd>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
              <dt className="text-[#5C6066]">Last checked</dt>
              <dd className="text-right font-mono text-xs text-[#5C6066] tabular-nums">
                {formatShortDate(connection.lastCheckedAt)}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ECE9E1] pt-4">
            <button
              type="button"
              disabled={verifying}
              onClick={handleVerify}
              className="inline-flex items-center gap-1.5 rounded bg-[#1E40AF] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#1E3A8A] disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${verifying ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>
                {verifying ? 'Checking server...' : 'Verify GitHub connection'}
              </span>
            </button>

            <button
              type="button"
              disabled={resetting}
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded border border-[#D4CFC4] bg-white px-3 py-2 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC] disabled:opacity-50 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {resetting ? 'Resetting...' : 'Reset demo workspace data'}
              </span>
            </button>
          </div>
        </section>

        <section className="space-y-4 rounded border border-[#E5E1D8] bg-white p-5 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#1A1C1E]">
                Local connected mode
              </h2>
              <p className="mt-0.5 text-xs text-[#5C6066]">
                Run FastAPI, LangGraph, PostgreSQL, and isolated Docker tests
                locally.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyCommands}
              className="inline-flex items-center gap-1 rounded border border-[#D4CFC4] px-2.5 py-1 text-xs font-medium text-[#1A1C1E] hover:bg-[#F4F2EC] whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#15803D]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded border border-[#E5E1D8] bg-[#FAF9F6] p-3.5 font-mono text-xs leading-relaxed text-[#1A1C1E]">
            {LOCAL_SETUP_COMMANDS}
          </pre>

          <div className="space-y-2 border-t border-[#ECE9E1] pt-3 text-xs text-[#5C6066]">
            <h3 className="font-semibold text-[#1A1C1E]">
              Server security boundaries
            </h3>
            <ul className="list-disc space-y-1.5 pl-4">
              <li>
                <span className="font-mono text-[#1A1C1E]">GITHUB_TOKEN</span>{' '}
                and{' '}
                <span className="font-mono text-[#1A1C1E]">GEMINI_API_KEY</span>{' '}
                are read strictly on the server and never sent to the browser.
              </li>
              <li>
                Generated code executes inside{' '}
                <span className="font-mono text-[#1A1C1E]">
                  backend/Dockerfile.sandbox
                </span>{' '}
                with{' '}
                <span className="font-mono text-[#1A1C1E]">
                  --network=none --read-only --user 1000:1000
                </span>{' '}
                and stripped environment variables.
              </li>
              <li>
                Merges require GitHub head SHA equality with the approved commit
                SHA so newer commits automatically invalidate approval.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

import fs from 'fs';
import path from 'path';
import type { WorkspaceSnapshot } from '../types/calder';
import { createInitialSeedWorkspace } from './seedData';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.resolve(DATA_DIR, 'calder-store.json');

let cachedWorkspace: WorkspaceSnapshot | null = null;

function refreshRuntimeConnectionFlags(
  workspace: WorkspaceSnapshot
): WorkspaceSnapshot {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const githubConnected = Boolean(process.env.GITHUB_TOKEN?.trim());
  const mode =
    process.env.CALDER_WORKSPACE_MODE === 'connected' && githubConnected
      ? 'connected'
      : 'demo';

  return {
    ...workspace,
    connection: {
      ...workspace.connection,
      mode,
      geminiConfigured,
      githubConnected: workspace.connection.githubConnected || githubConnected,
    },
  };
}

export function loadWorkspace(): WorkspaceSnapshot {
  if (cachedWorkspace) {
    return refreshRuntimeConnectionFlags(cachedWorkspace);
  }

  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as WorkspaceSnapshot;
      if (
        parsed &&
        Array.isArray(parsed.projects) &&
        Array.isArray(parsed.workItems) &&
        Array.isArray(parsed.runs)
      ) {
        cachedWorkspace = refreshRuntimeConnectionFlags(parsed);
        return cachedWorkspace;
      }
    }
  } catch (err) {
    console.error('Failed to read persisted Calder Works store, re-seeding:', err);
  }

  cachedWorkspace = createInitialSeedWorkspace();
  saveWorkspace(cachedWorkspace);
  return cachedWorkspace;
}

export function saveWorkspace(workspace: WorkspaceSnapshot): WorkspaceSnapshot {
  const synced = refreshRuntimeConnectionFlags(workspace);
  cachedWorkspace = synced;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(synced, null, 2), 'utf-8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error('Failed to persist Calder Works store:', err);
  }
  return synced;
}

export function resetWorkspaceToSeed(): WorkspaceSnapshot {
  const seeded = createInitialSeedWorkspace();
  return saveWorkspace(seeded);
}

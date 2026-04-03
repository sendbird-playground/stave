// ---------------------------------------------------------------------------
// Workspace Lifecycle Scripts – Process State (Electron main process)
// ---------------------------------------------------------------------------

import type { ChildProcess } from "node:child_process";
import type * as pty from "node-pty";

export interface WorkspaceScriptProcess {
  type: "finite" | "long-running";
  process: ChildProcess | pty.IPty | null;
  aborted: boolean;
  sessionId?: string;
}

const workspaceScriptProcesses = new Map<string, WorkspaceScriptProcess>();

export function getWorkspaceScriptProcess(key: string): WorkspaceScriptProcess | undefined {
  return workspaceScriptProcesses.get(key);
}

export function setWorkspaceScriptProcess(key: string, entry: WorkspaceScriptProcess): void {
  workspaceScriptProcesses.set(key, entry);
}

export function deleteWorkspaceScriptProcess(key: string): void {
  workspaceScriptProcesses.delete(key);
}

export function getAllWorkspaceScriptProcessKeys(): string[] {
  return [...workspaceScriptProcesses.keys()];
}

// ---------------------------------------------------------------------------
// Workspace Scripts – Process State (Electron main process)
// ---------------------------------------------------------------------------

import type { ChildProcess } from "node:child_process";
import type * as pty from "node-pty";
import type {
  ScriptKind,
  WorkspaceScriptRunSource,
} from "../../../src/lib/workspace-scripts/types";

export interface WorkspaceScriptProcess {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
  runId: string;
  source: WorkspaceScriptRunSource;
  process: ChildProcess | pty.IPty | null;
  aborted: boolean;
  sessionId?: string;
}

const workspaceScriptProcesses = new Map<string, WorkspaceScriptProcess>();

export function getScriptProcessKey(args: {
  workspaceId: string;
  scriptId: string;
  scriptKind: ScriptKind;
}) {
  return `${args.workspaceId}:${args.scriptKind}:${args.scriptId}`;
}

export function getWorkspaceScriptProcess(key: string): WorkspaceScriptProcess | undefined {
  return workspaceScriptProcesses.get(key);
}

export function setWorkspaceScriptProcess(key: string, entry: WorkspaceScriptProcess): void {
  workspaceScriptProcesses.set(key, entry);
}

export function deleteWorkspaceScriptProcess(key: string): void {
  workspaceScriptProcesses.delete(key);
}

export function listWorkspaceScriptProcessKeys(): string[] {
  return [...workspaceScriptProcesses.keys()];
}

export function listWorkspaceScriptProcessesForWorkspace(workspaceId: string): WorkspaceScriptProcess[] {
  return [...workspaceScriptProcesses.values()].filter((entry) => entry.workspaceId === workspaceId);
}

// ---------------------------------------------------------------------------
// Workspace Automations – Process State (Electron main process)
// ---------------------------------------------------------------------------

import type { ChildProcess } from "node:child_process";
import type * as pty from "node-pty";
import type {
  AutomationKind,
  WorkspaceAutomationRunSource,
} from "../../../src/lib/workspace-scripts/types";

export interface WorkspaceAutomationProcess {
  workspaceId: string;
  automationId: string;
  automationKind: AutomationKind;
  runId: string;
  source: WorkspaceAutomationRunSource;
  process: ChildProcess | pty.IPty | null;
  aborted: boolean;
  sessionId?: string;
}

const workspaceAutomationProcesses = new Map<string, WorkspaceAutomationProcess>();

export function getAutomationProcessKey(args: {
  workspaceId: string;
  automationId: string;
  automationKind: AutomationKind;
}) {
  return `${args.workspaceId}:${args.automationKind}:${args.automationId}`;
}

export function getWorkspaceAutomationProcess(key: string): WorkspaceAutomationProcess | undefined {
  return workspaceAutomationProcesses.get(key);
}

export function setWorkspaceAutomationProcess(key: string, entry: WorkspaceAutomationProcess): void {
  workspaceAutomationProcesses.set(key, entry);
}

export function deleteWorkspaceAutomationProcess(key: string): void {
  workspaceAutomationProcesses.delete(key);
}

export function listWorkspaceAutomationProcessKeys(): string[] {
  return [...workspaceAutomationProcesses.keys()];
}

export function listWorkspaceAutomationProcessesForWorkspace(workspaceId: string): WorkspaceAutomationProcess[] {
  return [...workspaceAutomationProcesses.values()].filter((entry) => entry.workspaceId === workspaceId);
}

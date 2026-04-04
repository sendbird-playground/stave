// ---------------------------------------------------------------------------
// Workspace Automations – Shared Types
// ---------------------------------------------------------------------------

// ---- Legacy lifecycle scripts ---------------------------------------------

/** Legacy lifecycle phases preserved for `.stave/scripts.json` compatibility. */
export type ScriptPhase = "setup" | "run" | "teardown";

/**
 * `.stave/scripts.json` — the legacy, team-shared config.
 *
 * The new automation layer still supports this shape and normalizes it into
 * actions, services, and hooks.
 */
export interface WorkspaceScriptsConfig {
  version: 1;
  setup?: string[];
  run?: string[];
  teardown?: string[];
}

/**
 * `.stave/scripts.local.json` — legacy, per-developer overrides.
 *
 * - Plain array replaces the base commands entirely.
 * - `{ before, after }` wraps the base commands.
 */
export type LocalPhaseOverride = string[] | { before?: string[]; after?: string[] };

export interface WorkspaceScriptsLocalConfig {
  version: 1;
  setup?: LocalPhaseOverride;
  run?: LocalPhaseOverride;
  teardown?: LocalPhaseOverride;
}

/** Fully resolved legacy commands for the three lifecycle phases. */
export interface ResolvedScriptsConfig {
  setup: string[];
  run: string[];
  teardown: string[];
}

// ---- Workspace automations ------------------------------------------------

export type AutomationKind = "action" | "service";
export type AutomationTargetScope = "workspace" | "project";
export type AutomationTrigger =
  | "workspace.created"
  | "workspace.archiving"
  | "pr.beforeOpen"
  | "pr.afterOpen";

export interface WorkspaceAutomationTargetConfig {
  label?: string;
  cwd?: AutomationTargetScope;
  env?: Record<string, string>;
  shell?: string;
}

export interface WorkspaceAutomationOrbitConfig {
  enabled?: boolean;
  name?: string;
  noTls?: boolean;
  proxyPort?: number;
}

export interface ResolvedWorkspaceAutomationOrbitConfig {
  name?: string;
  noTls: boolean;
  proxyPort?: number;
}

interface WorkspaceAutomationEntryConfigBase {
  label?: string;
  description?: string;
  commands: string[];
  target?: string;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface WorkspaceAutomationActionConfig extends WorkspaceAutomationEntryConfigBase {}

export interface WorkspaceAutomationServiceConfig extends WorkspaceAutomationEntryConfigBase {
  restartOnRun?: boolean;
  orbit?: WorkspaceAutomationOrbitConfig;
}

export type WorkspaceAutomationHookRef =
  | string
  | {
      ref: string;
      kind?: AutomationKind;
      blocking?: boolean;
    };

export interface WorkspaceAutomationsConfig {
  version: 2;
  actions?: Record<string, WorkspaceAutomationActionConfig>;
  services?: Record<string, WorkspaceAutomationServiceConfig>;
  hooks?: Partial<Record<AutomationTrigger, WorkspaceAutomationHookRef[]>>;
  targets?: Record<string, WorkspaceAutomationTargetConfig>;
}

export interface WorkspaceAutomationsLocalConfig {
  version: 2;
  actions?: Record<string, Partial<WorkspaceAutomationActionConfig>>;
  services?: Record<string, Partial<WorkspaceAutomationServiceConfig>>;
  hooks?: Partial<Record<AutomationTrigger, WorkspaceAutomationHookRef[]>>;
  targets?: Record<string, Partial<WorkspaceAutomationTargetConfig>>;
}

export interface ResolvedAutomationTarget {
  id: string;
  label: string;
  cwd: AutomationTargetScope;
  env: Record<string, string>;
  shell?: string;
}

export interface ResolvedWorkspaceAutomation {
  id: string;
  kind: AutomationKind;
  label: string;
  description: string;
  commands: string[];
  targetId: string;
  target: ResolvedAutomationTarget;
  timeoutMs?: number;
  restartOnRun?: boolean;
  orbit?: ResolvedWorkspaceAutomationOrbitConfig;
  source: "automation" | "legacy";
}

export interface ResolvedWorkspaceAutomationHook {
  trigger: AutomationTrigger;
  automationId: string;
  automationKind: AutomationKind;
  blocking: boolean;
}

export interface ResolvedWorkspaceAutomationsConfig {
  actions: ResolvedWorkspaceAutomation[];
  services: ResolvedWorkspaceAutomation[];
  hooks: Partial<Record<AutomationTrigger, ResolvedWorkspaceAutomationHook[]>>;
  targets: Record<string, ResolvedAutomationTarget>;
  legacyPhases: ResolvedScriptsConfig;
}

export type WorkspaceAutomationRunSource =
  | { kind: "manual" }
  | { kind: "hook"; trigger: AutomationTrigger };

export type WorkspaceAutomationEvent =
  | {
      type: "started";
      commandIndex: number;
      command: string;
      totalCommands: number;
    }
  | { type: "orbit-url"; url: string }
  | { type: "output"; data: string }
  | { type: "command-completed"; commandIndex: number; exitCode: number }
  | { type: "completed"; exitCode: number }
  | { type: "error"; error: string }
  | { type: "stopped" };

export interface WorkspaceAutomationEventEnvelope {
  workspaceId: string;
  automationId: string;
  automationKind: AutomationKind;
  runId: string;
  sessionId?: string;
  source: WorkspaceAutomationRunSource;
  event: WorkspaceAutomationEvent;
}

export interface WorkspaceAutomationStatusEntry {
  automationId: string;
  automationKind: AutomationKind;
  running: boolean;
  runId?: string;
  sessionId?: string;
  source?: WorkspaceAutomationRunSource;
}

export interface WorkspaceAutomationHookRunSummary {
  trigger: AutomationTrigger;
  totalEntries: number;
  executedEntries: number;
  failures: Array<{ automationId: string; message: string }>;
}

// ---- Legacy renderer state kept for compatibility ------------------------

export type PhaseExecutionStatus = "idle" | "running" | "success" | "error";

export interface PhaseExecutionState {
  status: PhaseExecutionStatus;
  terminalSessionId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  currentCommandIndex?: number;
  totalCommands?: number;
}

export interface WorkspaceScriptStatus {
  setup: PhaseExecutionState;
  run: PhaseExecutionState;
  teardown: PhaseExecutionState;
}

export type ScriptPhaseEvent =
  | { type: "started"; commandIndex: number; command: string; totalCommands: number }
  | { type: "output"; data: string }
  | { type: "command-completed"; commandIndex: number; exitCode: number }
  | { type: "phase-completed"; exitCode: number }
  | { type: "phase-error"; error: string };

export interface ScriptPhaseEventEnvelope {
  workspaceId: string;
  phase: ScriptPhase;
  event: ScriptPhaseEvent;
}

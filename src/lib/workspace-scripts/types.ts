// ---------------------------------------------------------------------------
// Workspace Lifecycle Scripts – Shared Types
// ---------------------------------------------------------------------------

/** The three lifecycle phases a workspace script config can define. */
export type ScriptPhase = "setup" | "run" | "teardown";

// ---- Config file shapes ---------------------------------------------------

/**
 * `.stave/scripts.json` — team-shared, committed to git.
 *
 * Each phase is an ordered array of shell commands executed sequentially.
 */
export interface WorkspaceScriptsConfig {
  version: 1;
  setup?: string[];
  run?: string[];
  teardown?: string[];
}

/**
 * A single phase entry inside a local override file.
 *
 * - **Plain array** → replaces the base commands entirely.
 * - **`{ before, after }`** → wraps the base commands (prepend / append).
 */
export type LocalPhaseOverride = string[] | { before?: string[]; after?: string[] };

/**
 * `.stave/scripts.local.json` — gitignored, per-developer overrides.
 *
 * Omitted phases fall through to the base config unchanged.
 */
export interface WorkspaceScriptsLocalConfig {
  version: 1;
  setup?: LocalPhaseOverride;
  run?: LocalPhaseOverride;
  teardown?: LocalPhaseOverride;
}

// ---- Resolved config (after merging base + local) -------------------------

/** Fully resolved commands for all three phases. Empty array = no commands. */
export interface ResolvedScriptsConfig {
  setup: string[];
  run: string[];
  teardown: string[];
}

// ---- Execution state (renderer-side) --------------------------------------

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

// ---- IPC event payloads (main → renderer push) ----------------------------

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

// ---------------------------------------------------------------------------
// Workspace Lifecycle Scripts – Constants
// ---------------------------------------------------------------------------

import type { ScriptPhase } from "./types";

/** Ordered list of all lifecycle phases. */
export const SCRIPT_PHASES: readonly ScriptPhase[] = ["setup", "run", "teardown"] as const;

// ---- Config file names ----------------------------------------------------

/** Team-shared config (committed to git). */
export const SCRIPTS_CONFIG_FILENAME = "scripts.json";

/** Per-developer local override (gitignored). */
export const SCRIPTS_LOCAL_CONFIG_FILENAME = "scripts.local.json";

/** Directory inside the project root that holds Stave config. */
export const STAVE_CONFIG_DIR = ".stave";

// ---- Environment variable names -------------------------------------------

export const SCRIPT_ENV_VARS = {
  ROOT_PATH: "STAVE_ROOT_PATH",
  WORKSPACE_NAME: "STAVE_WORKSPACE_NAME",
  WORKSPACE_PATH: "STAVE_WORKSPACE_PATH",
  BRANCH: "STAVE_BRANCH",
} as const;

// ---- IPC channel names ----------------------------------------------------

export const SCRIPTS_IPC = {
  GET_CONFIG: "workspace-scripts:get-config",
  RUN_PHASE: "workspace-scripts:run-phase",
  STOP_PHASE: "workspace-scripts:stop-phase",
  GET_STATUS: "workspace-scripts:get-status",
  PHASE_EVENT: "workspace-scripts:phase-event",
} as const;

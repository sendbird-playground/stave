// ---------------------------------------------------------------------------
// Workspace Lifecycle Scripts – Public API
// ---------------------------------------------------------------------------

export type {
  LocalPhaseOverride,
  PhaseExecutionState,
  PhaseExecutionStatus,
  ResolvedScriptsConfig,
  ScriptPhase,
  ScriptPhaseEvent,
  ScriptPhaseEventEnvelope,
  WorkspaceScriptStatus,
  WorkspaceScriptsConfig,
  WorkspaceScriptsLocalConfig,
} from "./types";

export {
  SCRIPT_ENV_VARS,
  SCRIPT_PHASES,
  SCRIPTS_CONFIG_FILENAME,
  SCRIPTS_IPC,
  SCRIPTS_LOCAL_CONFIG_FILENAME,
  STAVE_CONFIG_DIR,
} from "./constants";

export {
  createEmptyResolvedConfig,
  getPhaseCommands,
  hasAnyScripts,
  mergePhaseCommands,
  mergeScriptsConfigs,
  resolveScriptsFromTiers,
} from "./config";

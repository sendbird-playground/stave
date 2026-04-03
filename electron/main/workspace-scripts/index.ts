// ---------------------------------------------------------------------------
// Workspace Lifecycle Scripts – Electron Main Process Public API
// ---------------------------------------------------------------------------

export {
  resolveScriptsForWorkspace,
  BaseConfigSchema,
  LocalConfigSchema,
  type ResolveScriptsArgs,
} from "./config-loader";

export {
  runFinitePhase,
  runLongRunningPhase,
  stopPhase,
  getPhaseStatus,
  getAllPhaseStatuses,
  cleanupAllScriptProcesses,
  type RunPhaseArgs,
  type RunLongRunningPhaseArgs,
  type PhaseStatus,
} from "./executor";

export {
  type WorkspaceScriptProcess,
} from "./state";

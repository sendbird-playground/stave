// ---------------------------------------------------------------------------
// Workspace Automations – Electron Main Public API
// ---------------------------------------------------------------------------

export {
  resolveAutomationsForWorkspace,
  AutomationsConfigSchema,
  AutomationsLocalConfigSchema,
  type ResolveAutomationsArgs,
} from "./config-loader";

export {
  cleanupAllAutomationProcesses,
  getAutomationStatuses,
  runAutomationEntry,
  runAutomationHook,
  stopAllWorkspaceAutomationProcesses,
  stopAutomationEntry,
} from "./executor";

export {
  type WorkspaceAutomationProcess,
} from "./state";

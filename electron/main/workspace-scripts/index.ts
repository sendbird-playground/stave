// ---------------------------------------------------------------------------
// Workspace Automations – Electron Main Public API
// ---------------------------------------------------------------------------

export {
  resolveAutomationsForWorkspace,
  type ResolveAutomationsArgs,
} from "./config-loader";

export {
  AutomationsConfigSchema,
  AutomationsLocalConfigSchema,
} from "../../../src/lib/workspace-scripts/schemas";

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

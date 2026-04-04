// ---------------------------------------------------------------------------
// Workspace Automations – Public API
// ---------------------------------------------------------------------------

export type {
  AutomationKind,
  AutomationTargetScope,
  AutomationTrigger,
  ResolvedAutomationTarget,
  ResolvedWorkspaceAutomation,
  ResolvedWorkspaceAutomationOrbitConfig,
  ResolvedWorkspaceAutomationHook,
  ResolvedWorkspaceAutomationsConfig,
  WorkspaceAutomationActionConfig,
  WorkspaceAutomationEvent,
  WorkspaceAutomationEventEnvelope,
  WorkspaceAutomationHookRef,
  WorkspaceAutomationHookRunSummary,
  WorkspaceAutomationOrbitConfig,
  WorkspaceAutomationRunSource,
  WorkspaceAutomationServiceConfig,
  WorkspaceAutomationStatusEntry,
  WorkspaceAutomationTargetConfig,
  WorkspaceAutomationsConfig,
  WorkspaceAutomationsLocalConfig,
} from "./types";

export {
  AUTOMATIONS_CONFIG_FILENAME,
  AUTOMATIONS_LOCAL_CONFIG_FILENAME,
  AUTOMATION_ENV_VARS,
  AUTOMATION_TRIGGER_IDS,
  DEFAULT_AUTOMATION_TARGET_IDS,
  STAVE_CONFIG_DIR,
  WORKSPACE_AUTOMATIONS_IPC,
} from "./constants";

export {
  createDefaultAutomationTargets,
  getAutomationEntry,
  getAutomationHooksForTrigger,
  hasAnyAutomations,
  listAutomationEntries,
  mergeAutomationsConfig,
  resolveAutomationsFromConfig,
  resolveAutomationConfigFromTiers,
} from "./config";

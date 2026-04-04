// ---------------------------------------------------------------------------
// Workspace Automations – Constants
// ---------------------------------------------------------------------------

import type { AutomationTrigger } from "./types";

export const STAVE_CONFIG_DIR = ".stave";
export const AUTOMATIONS_CONFIG_FILENAME = "automations.json";
export const AUTOMATIONS_LOCAL_CONFIG_FILENAME = "automations.local.json";

export const AUTOMATION_TRIGGER_IDS: readonly AutomationTrigger[] = [
  "workspace.created",
  "workspace.archiving",
  "pr.beforeOpen",
  "pr.afterOpen",
] as const;

export const DEFAULT_AUTOMATION_TARGET_IDS = {
  WORKSPACE: "workspace",
  PROJECT: "project",
} as const;

export const AUTOMATION_ENV_VARS = {
  ROOT_PATH: "STAVE_ROOT_PATH",
  WORKSPACE_NAME: "STAVE_WORKSPACE_NAME",
  WORKSPACE_PATH: "STAVE_WORKSPACE_PATH",
  BRANCH: "STAVE_BRANCH",
  TARGET_ID: "STAVE_AUTOMATION_TARGET_ID",
  TRIGGER: "STAVE_AUTOMATION_TRIGGER",
} as const;

export const WORKSPACE_AUTOMATIONS_IPC = {
  GET_CONFIG: "workspace-automations:get-config",
  GET_STATUS: "workspace-automations:get-status",
  RUN_ENTRY: "workspace-automations:run-entry",
  STOP_ENTRY: "workspace-automations:stop-entry",
  RUN_HOOK: "workspace-automations:run-hook",
  STOP_ALL: "workspace-automations:stop-all",
  EVENT: "workspace-automations:event",
} as const;

// ---------------------------------------------------------------------------
// Workspace Automations – Config Resolution
// ---------------------------------------------------------------------------

import {
  AUTOMATION_TRIGGER_IDS,
  DEFAULT_AUTOMATION_TARGET_IDS,
} from "./constants";
import type {
  AutomationKind,
  AutomationTrigger,
  ResolvedAutomationTarget,
  ResolvedWorkspaceAutomation,
  ResolvedWorkspaceAutomationHook,
  ResolvedWorkspaceAutomationsConfig,
  WorkspaceAutomationActionConfig,
  WorkspaceAutomationHookRef,
  WorkspaceAutomationServiceConfig,
  WorkspaceAutomationsConfig,
  WorkspaceAutomationsLocalConfig,
  WorkspaceAutomationTargetConfig,
} from "./types";

function humanizeId(value: string) {
  return value
    .replaceAll(/[._:-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function createDefaultAutomationTargets(): Record<string, ResolvedAutomationTarget> {
  return {
    [DEFAULT_AUTOMATION_TARGET_IDS.WORKSPACE]: {
      id: DEFAULT_AUTOMATION_TARGET_IDS.WORKSPACE,
      label: "Workspace",
      cwd: "workspace",
      executionMode: "default",
      env: {},
    },
    [DEFAULT_AUTOMATION_TARGET_IDS.PROJECT]: {
      id: DEFAULT_AUTOMATION_TARGET_IDS.PROJECT,
      label: "Project",
      cwd: "project",
      executionMode: "default",
      env: {},
    },
    [DEFAULT_AUTOMATION_TARGET_IDS.SPOTLIGHT]: {
      id: DEFAULT_AUTOMATION_TARGET_IDS.SPOTLIGHT,
      label: "Spotlight",
      cwd: "project",
      executionMode: "spotlight",
      env: {},
    },
  };
}

function mergeTargetRecord(
  base: Record<string, WorkspaceAutomationTargetConfig> | undefined,
  local: Record<string, Partial<WorkspaceAutomationTargetConfig>> | undefined,
): Record<string, WorkspaceAutomationTargetConfig> {
  const result: Record<string, WorkspaceAutomationTargetConfig> = { ...(base ?? {}) };
  for (const [targetId, patch] of Object.entries(local ?? {})) {
    result[targetId] = {
      ...(result[targetId] ?? {}),
      ...patch,
      env: {
        ...(result[targetId]?.env ?? {}),
        ...(patch.env ?? {}),
      },
    };
  }
  return result;
}

function mergeActionRecord(
  base: Record<string, WorkspaceAutomationActionConfig> | undefined,
  local: Record<string, Partial<WorkspaceAutomationActionConfig>> | undefined,
): Record<string, WorkspaceAutomationActionConfig> {
  const result: Record<string, WorkspaceAutomationActionConfig> = { ...(base ?? {}) };
  for (const [entryId, patch] of Object.entries(local ?? {})) {
    result[entryId] = {
      ...(result[entryId] ?? { commands: [] }),
      ...patch,
      commands: patch.commands ?? result[entryId]?.commands ?? [],
    };
  }
  return result;
}

function mergeServiceRecord(
  base: Record<string, WorkspaceAutomationServiceConfig> | undefined,
  local: Record<string, Partial<WorkspaceAutomationServiceConfig>> | undefined,
): Record<string, WorkspaceAutomationServiceConfig> {
  const result: Record<string, WorkspaceAutomationServiceConfig> = { ...(base ?? {}) };
  for (const [entryId, patch] of Object.entries(local ?? {})) {
    result[entryId] = {
      ...(result[entryId] ?? { commands: [] }),
      ...patch,
      commands: patch.commands ?? result[entryId]?.commands ?? [],
    };
  }
  return result;
}

export function mergeAutomationsConfig(
  base: WorkspaceAutomationsConfig | null,
  local: WorkspaceAutomationsLocalConfig | null,
): WorkspaceAutomationsConfig | null {
  if (!base && !local) {
    return null;
  }
  return {
    version: 2,
    actions: mergeActionRecord(base?.actions, local?.actions),
    services: mergeServiceRecord(base?.services, local?.services),
    hooks: {
      ...(base?.hooks ?? {}),
      ...(local?.hooks ?? {}),
    },
    targets: mergeTargetRecord(base?.targets, local?.targets),
  };
}

function normalizeTargetMap(
  targets: Record<string, WorkspaceAutomationTargetConfig> | undefined,
): Record<string, ResolvedAutomationTarget> {
  const nextTargets = createDefaultAutomationTargets();
  for (const [targetId, target] of Object.entries(targets ?? {})) {
    nextTargets[targetId] = {
      id: targetId,
      label: target.label?.trim() || humanizeId(targetId),
      cwd: target.cwd ?? nextTargets[targetId]?.cwd ?? "workspace",
      executionMode: target.executionMode ?? nextTargets[targetId]?.executionMode ?? "default",
      env: { ...(nextTargets[targetId]?.env ?? {}), ...(target.env ?? {}) },
      shell: target.shell ?? nextTargets[targetId]?.shell,
    };
  }
  return nextTargets;
}

function normalizeEntryDescription(args: {
  entryId: string;
  entry: WorkspaceAutomationActionConfig | WorkspaceAutomationServiceConfig;
  kind: AutomationKind;
}) {
  if (args.entry.description?.trim()) {
    return args.entry.description.trim();
  }
  if (args.kind === "service") {
    return "Long-running automation service.";
  }
  return "Runnable workspace automation.";
}

function normalizeEntries(
  args: {
    entries: Record<string, WorkspaceAutomationActionConfig | WorkspaceAutomationServiceConfig> | undefined;
    kind: AutomationKind;
    targets: Record<string, ResolvedAutomationTarget>;
  },
): ResolvedWorkspaceAutomation[] {
  const fallbackTarget = args.targets[DEFAULT_AUTOMATION_TARGET_IDS.WORKSPACE];
  const resolvedEntries: ResolvedWorkspaceAutomation[] = [];

  for (const [entryId, entry] of Object.entries(args.entries ?? {})) {
    const commands = (entry.commands ?? []).map((command) => command.trim()).filter(Boolean);
    if (entry.enabled === false || commands.length === 0 || !fallbackTarget) {
      continue;
    }
    const targetId = entry.target?.trim() || DEFAULT_AUTOMATION_TARGET_IDS.WORKSPACE;
    const target = args.targets[targetId] ?? fallbackTarget;
    resolvedEntries.push({
      id: entryId,
      kind: args.kind,
      label: entry.label?.trim() || humanizeId(entryId),
      description: normalizeEntryDescription({ entryId, entry, kind: args.kind }),
      commands,
      targetId,
      target,
      timeoutMs: entry.timeoutMs,
      restartOnRun: args.kind === "service" ? (entry as WorkspaceAutomationServiceConfig).restartOnRun ?? true : undefined,
      source: "automation",
    });
  }

  return resolvedEntries;
}

function resolveHookRef(
  args: {
    ref: WorkspaceAutomationHookRef;
    trigger: AutomationTrigger;
    actionIds: Set<string>;
    serviceIds: Set<string>;
  },
): ResolvedWorkspaceAutomationHook | null {
  const rawRef = typeof args.ref === "string" ? args.ref : args.ref.ref;
  const automationId = rawRef.trim();
  if (!automationId) {
    return null;
  }

  const kind = typeof args.ref === "string"
    ? (args.actionIds.has(automationId)
        ? "action"
        : (args.serviceIds.has(automationId) ? "service" : null))
    : (args.ref.kind
        ?? (args.actionIds.has(automationId)
          ? "action"
          : (args.serviceIds.has(automationId) ? "service" : null)));
  if (!kind) {
    return null;
  }

  return {
    trigger: args.trigger,
    automationId,
    automationKind: kind,
    blocking: typeof args.ref === "string" ? true : args.ref.blocking ?? true,
  };
}

function normalizeHooks(
  args: {
    hooks: WorkspaceAutomationsConfig["hooks"];
    actions: ResolvedWorkspaceAutomation[];
    services: ResolvedWorkspaceAutomation[];
  },
): ResolvedWorkspaceAutomationsConfig["hooks"] {
  const actionIds = new Set(args.actions.map((entry) => entry.id));
  const serviceIds = new Set(args.services.map((entry) => entry.id));
  const result: ResolvedWorkspaceAutomationsConfig["hooks"] = {};

  for (const trigger of AUTOMATION_TRIGGER_IDS) {
    const refs = args.hooks?.[trigger];
    if (!refs || refs.length === 0) {
      continue;
    }
    const resolvedRefs = refs
      .map((ref) => resolveHookRef({ ref, trigger, actionIds, serviceIds }))
      .filter((item): item is ResolvedWorkspaceAutomationHook => item !== null);
    if (resolvedRefs.length > 0) {
      result[trigger] = resolvedRefs;
    }
  }

  return result;
}

export function resolveAutomationsFromConfig(
  config: WorkspaceAutomationsConfig | null,
): ResolvedWorkspaceAutomationsConfig | null {
  if (!config) {
    return null;
  }

  const targets = normalizeTargetMap(config.targets);
  const actions = normalizeEntries({
    entries: config.actions,
    kind: "action",
    targets,
  });
  const services = normalizeEntries({
    entries: config.services,
    kind: "service",
    targets,
  });
  const hooks = normalizeHooks({
    hooks: config.hooks,
    actions,
    services,
  });

  return {
    actions,
    services,
    hooks,
    targets,
    legacyPhases: {
      setup: [],
      run: [],
      teardown: [],
    },
  };
}

export function resolveAutomationConfigFromTiers(
  tiers: Array<{
    base: WorkspaceAutomationsConfig | null;
    local: WorkspaceAutomationsLocalConfig | null;
  }>,
): ResolvedWorkspaceAutomationsConfig | null {
  for (const tier of tiers) {
    if (!tier.base) {
      continue;
    }
    return resolveAutomationsFromConfig(mergeAutomationsConfig(tier.base, tier.local));
  }
  return null;
}

export function listAutomationEntries(
  config: ResolvedWorkspaceAutomationsConfig | null,
): ResolvedWorkspaceAutomation[] {
  if (!config) {
    return [];
  }
  return [...config.actions, ...config.services];
}

export function getAutomationEntry(
  config: ResolvedWorkspaceAutomationsConfig | null,
  args: { automationId: string; kind: AutomationKind },
): ResolvedWorkspaceAutomation | null {
  if (!config) {
    return null;
  }
  const collection = args.kind === "service" ? config.services : config.actions;
  return collection.find((entry) => entry.id === args.automationId) ?? null;
}

export function getAutomationHooksForTrigger(
  config: ResolvedWorkspaceAutomationsConfig | null,
  trigger: AutomationTrigger,
): ResolvedWorkspaceAutomationHook[] {
  return config?.hooks[trigger] ?? [];
}

export function hasAnyAutomations(config: ResolvedWorkspaceAutomationsConfig | null): boolean {
  return Boolean(config && (config.actions.length > 0 || config.services.length > 0 || Object.keys(config.hooks).length > 0));
}

// ---------------------------------------------------------------------------
// Workspace Lifecycle Scripts – Config Resolution (pure, no Node deps)
// ---------------------------------------------------------------------------

import { SCRIPT_PHASES } from "./constants";
import type {
  LocalPhaseOverride,
  ResolvedScriptsConfig,
  ScriptPhase,
  WorkspaceScriptsConfig,
  WorkspaceScriptsLocalConfig,
} from "./types";

// ---- Per-phase merge ------------------------------------------------------

/**
 * Merge a single phase's base commands with an optional local override.
 *
 * - If `local` is `undefined` → return `base` unchanged.
 * - If `local` is a plain `string[]` → full replace.
 * - If `local` is `{ before?, after? }` → prepend/append around `base`.
 */
export function mergePhaseCommands(
  base: string[] | undefined,
  local: LocalPhaseOverride | undefined,
): string[] {
  const baseCommands = base ?? [];

  if (local === undefined) {
    return baseCommands;
  }

  // Plain array → full replace
  if (Array.isArray(local)) {
    return local;
  }

  // Object with before / after → wrap
  const before = local.before ?? [];
  const after = local.after ?? [];
  return [...before, ...baseCommands, ...after];
}

// ---- Full config merge ----------------------------------------------------

/**
 * Merge a base config with an optional local override for all phases.
 * Returns a fully resolved config with empty arrays for unconfigured phases.
 */
export function mergeScriptsConfigs(
  base: WorkspaceScriptsConfig | null,
  local: WorkspaceScriptsLocalConfig | null,
): ResolvedScriptsConfig {
  return {
    setup: mergePhaseCommands(base?.setup, local?.setup),
    run: mergePhaseCommands(base?.run, local?.run),
    teardown: mergePhaseCommands(base?.teardown, local?.teardown),
  };
}

// ---- Config tier resolution -----------------------------------------------

/**
 * Given an ordered list of candidate config layers (highest priority first),
 * return the resolved config from the first tier that has a base config.
 *
 * Each tier is `{ base, local }` where `local` may be null.
 * No merging occurs *across* tiers — only the winning tier's base + local
 * are merged together.
 */
export function resolveScriptsFromTiers(
  tiers: Array<{
    base: WorkspaceScriptsConfig | null;
    local: WorkspaceScriptsLocalConfig | null;
  }>,
): ResolvedScriptsConfig | null {
  for (const tier of tiers) {
    if (tier.base !== null) {
      return mergeScriptsConfigs(tier.base, tier.local);
    }
  }
  return null;
}

// ---- Helpers --------------------------------------------------------------

/** Returns true if a resolved config has at least one command in any phase. */
export function hasAnyScripts(config: ResolvedScriptsConfig | null): boolean {
  if (!config) return false;
  return SCRIPT_PHASES.some((phase) => config[phase].length > 0);
}

/** Returns the commands for a specific phase, or an empty array. */
export function getPhaseCommands(
  config: ResolvedScriptsConfig | null,
  phase: ScriptPhase,
): string[] {
  return config?.[phase] ?? [];
}

/** Creates an empty resolved config (all phases empty). */
export function createEmptyResolvedConfig(): ResolvedScriptsConfig {
  return { setup: [], run: [], teardown: [] };
}

// ---------------------------------------------------------------------------
// Workspace Lifecycle Scripts – Config Loader (Electron main process)
// ---------------------------------------------------------------------------

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  SCRIPTS_CONFIG_FILENAME,
  SCRIPTS_LOCAL_CONFIG_FILENAME,
  STAVE_CONFIG_DIR,
} from "../../../src/lib/workspace-scripts/constants";
import type {
  ResolvedScriptsConfig,
  WorkspaceScriptsConfig,
  WorkspaceScriptsLocalConfig,
} from "../../../src/lib/workspace-scripts/types";
import { resolveScriptsFromTiers } from "../../../src/lib/workspace-scripts/config";

// ---- Zod schemas for validation -------------------------------------------

const BaseConfigSchema = z.object({
  version: z.literal(1),
  setup: z.array(z.string()).optional(),
  run: z.array(z.string()).optional(),
  teardown: z.array(z.string()).optional(),
});

const LocalPhaseOverrideSchema = z.union([
  z.array(z.string()),
  z.object({
    before: z.array(z.string()).optional(),
    after: z.array(z.string()).optional(),
  }),
]);

const LocalConfigSchema = z.object({
  version: z.literal(1),
  setup: LocalPhaseOverrideSchema.optional(),
  run: LocalPhaseOverrideSchema.optional(),
  teardown: LocalPhaseOverrideSchema.optional(),
});

// ---- File reading ---------------------------------------------------------

async function readJsonFile<T>(filePath: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      console.warn(`[workspace-scripts] Invalid config at ${filePath}:`, result.error.message);
      return null;
    }
    return result.data;
  } catch {
    // File doesn't exist or can't be read — not an error
    return null;
  }
}

async function loadConfigPair(dir: string): Promise<{
  base: WorkspaceScriptsConfig | null;
  local: WorkspaceScriptsLocalConfig | null;
}> {
  const basePath = path.join(dir, STAVE_CONFIG_DIR, SCRIPTS_CONFIG_FILENAME);
  const localPath = path.join(dir, STAVE_CONFIG_DIR, SCRIPTS_LOCAL_CONFIG_FILENAME);

  const [base, local] = await Promise.all([
    readJsonFile(basePath, BaseConfigSchema),
    readJsonFile(localPath, LocalConfigSchema),
  ]);

  return { base, local };
}

// ---- Public API -----------------------------------------------------------

export interface ResolveScriptsArgs {
  /** Absolute path to the project root (contains `.stave/`). */
  projectPath: string;
  /** Absolute path to the workspace worktree. */
  workspacePath: string;
  /** Optional user-level override directory (e.g. `~/.stave/projects/{id}`). */
  userOverridePath?: string;
}

/**
 * Resolve the scripts config for a workspace using the three-tier priority:
 * 1. User override (`~/.stave/projects/{project-id}/`)
 * 2. Worktree-level (`{worktreePath}/.stave/`)
 * 3. Project root (`{projectRoot}/.stave/`)
 *
 * Returns `null` if no config was found at any tier.
 * Always reads fresh from disk (no caching).
 */
export async function resolveScriptsForWorkspace(
  args: ResolveScriptsArgs,
): Promise<ResolvedScriptsConfig | null> {
  const tiers: Array<{
    base: WorkspaceScriptsConfig | null;
    local: WorkspaceScriptsLocalConfig | null;
  }> = [];

  // Tier 1: User override (only base config, no local override at user level)
  if (args.userOverridePath) {
    const userBase = await readJsonFile(
      path.join(args.userOverridePath, SCRIPTS_CONFIG_FILENAME),
      BaseConfigSchema,
    );
    if (userBase) {
      tiers.push({ base: userBase, local: null });
    }
  }

  // Tier 2: Worktree-level (only if different from project root)
  const normalizedWorkspace = path.resolve(args.workspacePath);
  const normalizedProject = path.resolve(args.projectPath);
  if (normalizedWorkspace !== normalizedProject) {
    tiers.push(await loadConfigPair(args.workspacePath));
  }

  // Tier 3: Project root
  tiers.push(await loadConfigPair(args.projectPath));

  return resolveScriptsFromTiers(tiers);
}

export { BaseConfigSchema, LocalConfigSchema };

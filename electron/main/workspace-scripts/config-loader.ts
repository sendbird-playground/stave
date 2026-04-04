// ---------------------------------------------------------------------------
// Workspace Automations – Config Loader (Electron main process)
// ---------------------------------------------------------------------------

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  AUTOMATIONS_CONFIG_FILENAME,
  AUTOMATIONS_LOCAL_CONFIG_FILENAME,
  STAVE_CONFIG_DIR,
} from "../../../src/lib/workspace-scripts/constants";
import {
  resolveAutomationConfigFromTiers,
} from "../../../src/lib/workspace-scripts/config";
import {
  AutomationsConfigSchema,
  AutomationsLocalConfigSchema,
} from "../../../src/lib/workspace-scripts/schemas";
import type {
  ResolvedWorkspaceAutomationsConfig,
  WorkspaceAutomationsConfig,
  WorkspaceAutomationsLocalConfig,
} from "../../../src/lib/workspace-scripts/types";

async function readJsonFile<T>(filePath: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      console.warn(`[workspace-automations] Invalid config at ${filePath}:`, result.error.message);
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

async function loadConfigPair(dir: string): Promise<{
  base: WorkspaceAutomationsConfig | null;
  local: WorkspaceAutomationsLocalConfig | null;
}> {
  const basePath = path.join(dir, STAVE_CONFIG_DIR, AUTOMATIONS_CONFIG_FILENAME);
  const localPath = path.join(dir, STAVE_CONFIG_DIR, AUTOMATIONS_LOCAL_CONFIG_FILENAME);

  const [base, local] = await Promise.all([
    readJsonFile(basePath, AutomationsConfigSchema),
    readJsonFile(localPath, AutomationsLocalConfigSchema),
  ]);

  return { base, local };
}

export interface ResolveAutomationsArgs {
  projectPath: string;
  workspacePath: string;
  userOverridePath?: string;
}

export async function resolveAutomationsForWorkspace(
  args: ResolveAutomationsArgs,
): Promise<ResolvedWorkspaceAutomationsConfig | null> {
  const tiers: Array<{
    base: WorkspaceAutomationsConfig | null;
    local: WorkspaceAutomationsLocalConfig | null;
  }> = [];

  if (args.userOverridePath) {
    const userBase = await readJsonFile(
      path.join(args.userOverridePath, AUTOMATIONS_CONFIG_FILENAME),
      AutomationsConfigSchema,
    );
    if (userBase) {
      tiers.push({ base: userBase, local: null });
    }
  }

  const normalizedWorkspace = path.resolve(args.workspacePath);
  const normalizedProject = path.resolve(args.projectPath);
  if (normalizedWorkspace !== normalizedProject) {
    tiers.push(await loadConfigPair(args.workspacePath));
  }

  tiers.push(await loadConfigPair(args.projectPath));

  return resolveAutomationConfigFromTiers(tiers);
}

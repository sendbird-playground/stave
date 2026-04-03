import { describe, expect, test } from "bun:test";
import {
  createEmptyResolvedConfig,
  getPhaseCommands,
  hasAnyScripts,
  mergePhaseCommands,
  mergeScriptsConfigs,
  resolveScriptsFromTiers,
} from "../src/lib/workspace-scripts/config";
import type {
  WorkspaceScriptsConfig,
  WorkspaceScriptsLocalConfig,
} from "../src/lib/workspace-scripts/types";

// ---------------------------------------------------------------------------
// mergePhaseCommands
// ---------------------------------------------------------------------------

describe("mergePhaseCommands", () => {
  test("returns base unchanged when local is undefined", () => {
    expect(mergePhaseCommands(["bun install"], undefined)).toEqual(["bun install"]);
  });

  test("returns empty array when both base and local are undefined", () => {
    expect(mergePhaseCommands(undefined, undefined)).toEqual([]);
  });

  test("local plain array fully replaces base", () => {
    expect(
      mergePhaseCommands(["bun install"], ["npm ci"]),
    ).toEqual(["npm ci"]);
  });

  test("local plain array replaces even when base is undefined", () => {
    expect(
      mergePhaseCommands(undefined, ["npm ci"]),
    ).toEqual(["npm ci"]);
  });

  test("local empty array replaces base (clears phase)", () => {
    expect(
      mergePhaseCommands(["bun install", "bun run migrate"], []),
    ).toEqual([]);
  });

  test("local { before } prepends to base", () => {
    expect(
      mergePhaseCommands(["bun run dev"], { before: ["export DEBUG=1"] }),
    ).toEqual(["export DEBUG=1", "bun run dev"]);
  });

  test("local { after } appends to base", () => {
    expect(
      mergePhaseCommands(["bun install"], { after: ["bun run generate"] }),
    ).toEqual(["bun install", "bun run generate"]);
  });

  test("local { before, after } wraps base", () => {
    expect(
      mergePhaseCommands(
        ["bun run dev"],
        { before: ["export DEBUG=1"], after: ["echo done"] },
      ),
    ).toEqual(["export DEBUG=1", "bun run dev", "echo done"]);
  });

  test("local { before, after } with empty base", () => {
    expect(
      mergePhaseCommands(undefined, { before: ["setup"], after: ["cleanup"] }),
    ).toEqual(["setup", "cleanup"]);
  });

  test("local {} (empty object) keeps base unchanged", () => {
    expect(
      mergePhaseCommands(["bun install"], {}),
    ).toEqual(["bun install"]);
  });
});

// ---------------------------------------------------------------------------
// mergeScriptsConfigs
// ---------------------------------------------------------------------------

describe("mergeScriptsConfigs", () => {
  test("returns all empty when base is null and local is null", () => {
    expect(mergeScriptsConfigs(null, null)).toEqual({
      setup: [],
      run: [],
      teardown: [],
    });
  });

  test("returns base commands when local is null", () => {
    const base: WorkspaceScriptsConfig = {
      version: 1,
      setup: ["bun install"],
      run: ["bun run dev"],
    };
    expect(mergeScriptsConfigs(base, null)).toEqual({
      setup: ["bun install"],
      run: ["bun run dev"],
      teardown: [],
    });
  });

  test("merges each phase independently", () => {
    const base: WorkspaceScriptsConfig = {
      version: 1,
      setup: ["bun install"],
      run: ["bun run dev"],
      teardown: ["docker-compose down"],
    };
    const local: WorkspaceScriptsLocalConfig = {
      version: 1,
      setup: ["npm ci"],                                    // replace
      run: { before: ["export PORT=3001"] },                // extend
      // teardown omitted → falls through
    };
    expect(mergeScriptsConfigs(base, local)).toEqual({
      setup: ["npm ci"],
      run: ["export PORT=3001", "bun run dev"],
      teardown: ["docker-compose down"],
    });
  });
});

// ---------------------------------------------------------------------------
// resolveScriptsFromTiers
// ---------------------------------------------------------------------------

describe("resolveScriptsFromTiers", () => {
  test("returns null when no tiers have a base config", () => {
    expect(resolveScriptsFromTiers([
      { base: null, local: null },
      { base: null, local: null },
    ])).toBeNull();
  });

  test("uses first tier with a base config (tier 1 wins)", () => {
    const tier1Base: WorkspaceScriptsConfig = {
      version: 1,
      setup: ["tier1-setup"],
    };
    const tier2Base: WorkspaceScriptsConfig = {
      version: 1,
      setup: ["tier2-setup"],
      run: ["tier2-run"],
    };
    const result = resolveScriptsFromTiers([
      { base: tier1Base, local: null },
      { base: tier2Base, local: null },
    ]);
    expect(result).toEqual({
      setup: ["tier1-setup"],
      run: [],
      teardown: [],
    });
  });

  test("skips empty tier 1, uses tier 2", () => {
    const tier2Base: WorkspaceScriptsConfig = {
      version: 1,
      run: ["bun run dev"],
    };
    const result = resolveScriptsFromTiers([
      { base: null, local: null },
      { base: tier2Base, local: null },
    ]);
    expect(result).toEqual({
      setup: [],
      run: ["bun run dev"],
      teardown: [],
    });
  });

  test("winning tier's local override is applied", () => {
    const base: WorkspaceScriptsConfig = {
      version: 1,
      setup: ["bun install"],
      run: ["bun run dev"],
    };
    const local: WorkspaceScriptsLocalConfig = {
      version: 1,
      run: { before: ["export DEBUG=1"] },
    };
    const result = resolveScriptsFromTiers([
      { base, local },
    ]);
    expect(result).toEqual({
      setup: ["bun install"],
      run: ["export DEBUG=1", "bun run dev"],
      teardown: [],
    });
  });

  test("three-tier resolution: user > worktree > project", () => {
    const userBase: WorkspaceScriptsConfig = { version: 1, setup: ["user-setup"] };
    const worktreeBase: WorkspaceScriptsConfig = { version: 1, setup: ["worktree-setup"] };
    const projectBase: WorkspaceScriptsConfig = { version: 1, setup: ["project-setup"] };

    // User tier wins
    expect(resolveScriptsFromTiers([
      { base: userBase, local: null },
      { base: worktreeBase, local: null },
      { base: projectBase, local: null },
    ])?.setup).toEqual(["user-setup"]);

    // No user tier → worktree wins
    expect(resolveScriptsFromTiers([
      { base: null, local: null },
      { base: worktreeBase, local: null },
      { base: projectBase, local: null },
    ])?.setup).toEqual(["worktree-setup"]);

    // No user or worktree → project wins
    expect(resolveScriptsFromTiers([
      { base: null, local: null },
      { base: null, local: null },
      { base: projectBase, local: null },
    ])?.setup).toEqual(["project-setup"]);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("hasAnyScripts", () => {
  test("returns false for null", () => {
    expect(hasAnyScripts(null)).toBe(false);
  });

  test("returns false for empty config", () => {
    expect(hasAnyScripts(createEmptyResolvedConfig())).toBe(false);
  });

  test("returns true when any phase has commands", () => {
    expect(hasAnyScripts({ setup: [], run: ["bun dev"], teardown: [] })).toBe(true);
  });
});

describe("getPhaseCommands", () => {
  test("returns empty array for null config", () => {
    expect(getPhaseCommands(null, "setup")).toEqual([]);
  });

  test("returns commands for a specific phase", () => {
    const config = { setup: ["a"], run: ["b", "c"], teardown: [] };
    expect(getPhaseCommands(config, "run")).toEqual(["b", "c"]);
  });
});

describe("createEmptyResolvedConfig", () => {
  test("returns all phases as empty arrays", () => {
    expect(createEmptyResolvedConfig()).toEqual({
      setup: [],
      run: [],
      teardown: [],
    });
  });
});

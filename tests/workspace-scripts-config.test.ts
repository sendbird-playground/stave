import { describe, expect, test } from "bun:test";
import {
  createDefaultAutomationTargets,
  getAutomationEntry,
  getAutomationHooksForTrigger,
  hasAnyAutomations,
  mergeAutomationsConfig,
  resolveAutomationConfigFromTiers,
  resolveAutomationsFromConfig,
} from "../src/lib/workspace-scripts/config";
import type {
  WorkspaceAutomationsConfig,
  WorkspaceAutomationsLocalConfig,
} from "../src/lib/workspace-scripts/types";

describe("mergeAutomationsConfig", () => {
  test("returns null when both base and local are null", () => {
    expect(mergeAutomationsConfig(null, null)).toBeNull();
  });

  test("merges action and service overrides by id", () => {
    const base: WorkspaceAutomationsConfig = {
      version: 2,
      actions: {
        bootstrap: {
          label: "Bootstrap",
          commands: ["bun install"],
          target: "workspace",
        },
      },
      services: {
        dev: {
          commands: ["bun run dev"],
          target: "spotlight",
        },
      },
    };
    const local: WorkspaceAutomationsLocalConfig = {
      version: 2,
      actions: {
        bootstrap: {
          commands: ["pnpm install"],
        },
      },
      services: {
        dev: {
          restartOnRun: false,
        },
      },
    };

    expect(mergeAutomationsConfig(base, local)).toEqual({
      version: 2,
      actions: {
        bootstrap: {
          label: "Bootstrap",
          commands: ["pnpm install"],
          target: "workspace",
        },
      },
      services: {
        dev: {
          commands: ["bun run dev"],
          target: "spotlight",
          restartOnRun: false,
        },
      },
      hooks: {},
      targets: {},
    });
  });

  test("merges target env values shallowly", () => {
    const base: WorkspaceAutomationsConfig = {
      version: 2,
      targets: {
        spotlight: {
          cwd: "project",
          executionMode: "spotlight",
          env: { PORT: "3000" },
        },
      },
    };
    const local: WorkspaceAutomationsLocalConfig = {
      version: 2,
      targets: {
        spotlight: {
          env: { DEBUG: "1" },
        },
      },
    };

    expect(mergeAutomationsConfig(base, local)?.targets?.spotlight).toEqual({
      cwd: "project",
      executionMode: "spotlight",
      env: {
        PORT: "3000",
        DEBUG: "1",
      },
    });
  });
});

describe("resolveAutomationsFromConfig", () => {
  test("normalizes actions, services, hooks, and targets", () => {
    const config: WorkspaceAutomationsConfig = {
      version: 2,
      targets: {
        spotlight: {
          label: "Spotlight Runtime",
          cwd: "project",
          executionMode: "spotlight",
        },
      },
      actions: {
        bootstrap: {
          description: "Prepare the workspace.",
          commands: ["bun install", "bun run db:prepare"],
        },
      },
      services: {
        app: {
          commands: ["bun run dev"],
          target: "spotlight",
        },
      },
      hooks: {
        "workspace.created": ["bootstrap"],
        "pr.beforeOpen": [{ ref: "app", kind: "service", blocking: false }],
      },
    };

    const resolved = resolveAutomationsFromConfig(config);
    expect(resolved?.actions).toHaveLength(1);
    expect(resolved?.services).toHaveLength(1);
    expect(resolved?.targets.spotlight).toMatchObject({
      label: "Spotlight Runtime",
      cwd: "project",
      executionMode: "spotlight",
    });
    expect(getAutomationHooksForTrigger(resolved ?? null, "workspace.created")).toEqual([
      {
        trigger: "workspace.created",
        automationId: "bootstrap",
        automationKind: "action",
        blocking: true,
      },
    ]);
    expect(getAutomationHooksForTrigger(resolved ?? null, "pr.beforeOpen")).toEqual([
      {
        trigger: "pr.beforeOpen",
        automationId: "app",
        automationKind: "service",
        blocking: false,
      },
    ]);
  });

  test("drops disabled or empty entries", () => {
    const resolved = resolveAutomationsFromConfig({
      version: 2,
      actions: {
        noop: {
          commands: [],
        },
        disabled: {
          commands: ["echo nope"],
          enabled: false,
        },
      },
    });

    expect(resolved?.actions).toEqual([]);
  });
});

describe("resolveAutomationConfigFromTiers", () => {
  test("returns the first tier with a base config", () => {
    const first: WorkspaceAutomationsConfig = {
      version: 2,
      actions: {
        one: {
          commands: ["echo first"],
        },
      },
    };
    const second: WorkspaceAutomationsConfig = {
      version: 2,
      actions: {
        two: {
          commands: ["echo second"],
        },
      },
    };

    const resolved = resolveAutomationConfigFromTiers([
      { base: first, local: null },
      { base: second, local: null },
    ]);

    expect(resolved?.actions.map((action) => action.id)).toEqual(["one"]);
  });

  test("applies local overrides inside the winning tier", () => {
    const base: WorkspaceAutomationsConfig = {
      version: 2,
      services: {
        app: {
          commands: ["bun run dev"],
        },
      },
    };
    const local: WorkspaceAutomationsLocalConfig = {
      version: 2,
      services: {
        app: {
          target: "spotlight",
        },
      },
    };

    const resolved = resolveAutomationConfigFromTiers([{ base, local }]);
    expect(getAutomationEntry(resolved ?? null, { automationId: "app", kind: "service" })).toMatchObject({
      targetId: "spotlight",
      target: {
        executionMode: "spotlight",
      },
    });
  });
});

describe("helpers", () => {
  test("default targets include workspace, project, and spotlight", () => {
    expect(Object.keys(createDefaultAutomationTargets())).toEqual(["workspace", "project", "spotlight"]);
  });

  test("hasAnyAutomations reflects content", () => {
    expect(hasAnyAutomations(null)).toBe(false);
    expect(hasAnyAutomations(resolveAutomationsFromConfig({ version: 2 }))).toBe(false);
    expect(
      hasAnyAutomations(
        resolveAutomationsFromConfig({
          version: 2,
          actions: {
            bootstrap: {
              commands: ["bun install"],
            },
          },
        }),
      ),
    ).toBe(true);
  });
});

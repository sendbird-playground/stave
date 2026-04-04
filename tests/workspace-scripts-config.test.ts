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
          target: "project",
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
          target: "project",
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
        project: {
          cwd: "project",
          env: { PORT: "3000" },
        },
      },
    };
    const local: WorkspaceAutomationsLocalConfig = {
      version: 2,
      targets: {
        project: {
          env: { DEBUG: "1" },
        },
      },
    };

    expect(mergeAutomationsConfig(base, local)?.targets?.project).toEqual({
      cwd: "project",
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
        ci: {
          label: "CI Runtime",
          cwd: "project",
          env: {
            CI: "1",
          },
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
          orbit: {
            enabled: true,
            name: "stave-desktop",
          },
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
    expect(resolved?.targets.ci).toMatchObject({
      label: "CI Runtime",
      cwd: "project",
      env: {
        CI: "1",
      },
    });
    expect(resolved?.services[0]?.orbit).toEqual({
      name: "stave-desktop",
      noTls: false,
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
          target: "project",
        },
      },
    };

    const resolved = resolveAutomationConfigFromTiers([{ base, local }]);
    expect(getAutomationEntry(resolved ?? null, { automationId: "app", kind: "service" })).toMatchObject({
      targetId: "project",
      target: {
        cwd: "project",
      },
    });
  });
});

describe("helpers", () => {
  test("default targets include workspace and project", () => {
    expect(Object.keys(createDefaultAutomationTargets())).toEqual(["workspace", "project"]);
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

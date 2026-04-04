import { describe, expect, test } from "bun:test";
import {
  buildAutomationConfigFromEditorState,
  buildAutomationEditorState,
  createEmptyAutomationEditorEntry,
  mergeAutomationConfigIntoRaw,
  validateAutomationEditorState,
} from "../src/lib/workspace-scripts/editor";
import type {
  ResolvedWorkspaceAutomationsConfig,
  WorkspaceAutomationsConfig,
} from "../src/lib/workspace-scripts/types";

describe("buildAutomationEditorState", () => {
  test("hydrates entries and hook links from shared config", () => {
    const config: WorkspaceAutomationsConfig = {
      version: 2,
      actions: {
        bootstrap: {
          label: "Bootstrap",
          commands: ["bun install"],
        },
      },
      services: {
        app: {
          commands: ["bun run dev"],
          restartOnRun: false,
          orbit: {
            enabled: true,
            name: "stave",
            noTls: true,
            proxyPort: 1355,
          },
        },
      },
      hooks: {
        "workspace.created": ["bootstrap"],
        "pr.beforeOpen": [{ ref: "app", blocking: false }],
      },
    };

    const editorState = buildAutomationEditorState({ config });
    expect(editorState.actions[0]).toMatchObject({
      id: "bootstrap",
      label: "Bootstrap",
      commandsText: "bun install",
      enabled: true,
    });
    expect(editorState.services[0]).toMatchObject({
      id: "app",
      restartOnRun: false,
      commandsText: "bun run dev",
      orbitEnabled: true,
      orbitName: "stave",
      orbitNoTls: true,
      orbitProxyPort: "1355",
    });
    expect(editorState.hooks["workspace.created"]).toEqual([
      {
        automationId: "bootstrap",
        automationKind: "action",
        blocking: true,
      },
    ]);
    expect(editorState.hooks["pr.beforeOpen"]).toEqual([
      {
        automationId: "app",
        automationKind: "service",
        blocking: false,
      },
    ]);
  });

  test("uses resolved config to infer hook kind when needed", () => {
    const config: WorkspaceAutomationsConfig = {
      version: 2,
      hooks: {
        "workspace.created": ["bootstrap"],
      },
    };
    const resolvedConfig: ResolvedWorkspaceAutomationsConfig = {
      actions: [
        {
          id: "bootstrap",
          kind: "action",
          label: "Bootstrap",
          description: "Prepare the workspace.",
          commands: ["bun install"],
          targetId: "workspace",
          target: {
            id: "workspace",
            label: "Workspace",
            cwd: "workspace",
            env: {},
          },
          source: "automation",
        },
      ],
      services: [],
      hooks: {},
      targets: {
        workspace: {
          id: "workspace",
          label: "Workspace",
          cwd: "workspace",
          env: {},
        },
      },
      legacyPhases: {
        setup: [],
        run: [],
        teardown: [],
      },
    };

    const editorState = buildAutomationEditorState({ config, resolvedConfig });
    expect(editorState.hooks["workspace.created"]).toEqual([
      {
        automationId: "bootstrap",
        automationKind: "action",
        blocking: true,
      },
    ]);
  });
});

describe("buildAutomationConfigFromEditorState", () => {
  test("serializes actions, services, and hooks into config JSON shape", () => {
    const action = createEmptyAutomationEditorEntry("action");
    action.id = "bootstrap";
    action.label = "Bootstrap";
    action.description = "Prepare the workspace.";
    action.commandsText = "bun install\nbun run db:prepare";

    const service = createEmptyAutomationEditorEntry("service");
    service.id = "app";
    service.target = "workspace";
    service.commandsText = "bun run dev";
    service.restartOnRun = false;
    service.orbitEnabled = true;
    service.orbitName = "Stave Desktop";
    service.orbitNoTls = true;
    service.orbitProxyPort = "1355";

    const config = buildAutomationConfigFromEditorState({
      actions: [action],
      services: [service],
      hooks: {
        "workspace.created": [
          {
            automationId: "bootstrap",
            automationKind: "action",
            blocking: true,
          },
        ],
        "pr.beforeOpen": [
          {
            automationId: "app",
            automationKind: "service",
            blocking: false,
          },
        ],
      },
    });

    expect(config).toEqual({
      version: 2,
      actions: {
        bootstrap: {
          label: "Bootstrap",
          description: "Prepare the workspace.",
          commands: ["bun install", "bun run db:prepare"],
          target: "workspace",
        },
      },
      services: {
        app: {
          commands: ["bun run dev"],
          target: "workspace",
          restartOnRun: false,
          orbit: {
            enabled: true,
            name: "Stave Desktop",
            noTls: true,
            proxyPort: 1355,
          },
        },
      },
      hooks: {
        "workspace.created": [
          {
            ref: "bootstrap",
            kind: "action",
          },
        ],
        "pr.beforeOpen": [
          {
            ref: "app",
            kind: "service",
            blocking: false,
          },
        ],
      },
    });
  });
});

describe("mergeAutomationConfigIntoRaw", () => {
  test("preserves untouched target definitions and extra metadata", () => {
    const rawConfig = {
      version: 2,
      notes: {
        owner: "team-desktop",
      },
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
        old: {
          commands: ["echo old"],
        },
      },
    };

    const merged = mergeAutomationConfigIntoRaw({
      rawConfig,
      config: {
        version: 2,
        actions: {
          bootstrap: {
            commands: ["bun install"],
            target: "workspace",
          },
        },
      },
    });

    expect(merged).toEqual({
      version: 2,
      notes: {
        owner: "team-desktop",
      },
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
          commands: ["bun install"],
          target: "workspace",
        },
      },
    });
  });
});

describe("validateAutomationEditorState", () => {
  test("reports missing ids and invalid timeouts", () => {
    const entry = createEmptyAutomationEditorEntry("action");
    entry.timeoutMs = "0";

    expect(validateAutomationEditorState({
      actions: [entry],
      services: [],
      hooks: {},
    })).toEqual([
      'actions: "action 1" is missing an id.',
      'actions: "action 1" needs at least one command.',
      'actions: "action 1" has an invalid timeout.',
    ]);
  });
});

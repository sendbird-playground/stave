import { describe, expect, it } from "bun:test";
import {
  buildStaveMuseContextSnapshot,
  createEmptyStaveMuseState,
  findStaveMuseWorkspaceMention,
  resolveStaveMuseLocalAction,
} from "@/lib/stave-muse";
import { createEmptyWorkspaceInformation, createWorkspaceInfoCustomField, createWorkspaceTodoItem } from "@/lib/workspace-information";

describe("createEmptyStaveMuseState", () => {
  it("defaults to the app target", () => {
    const state = createEmptyStaveMuseState();
    expect(state.target.kind).toBe("app");
    expect(state.messages).toEqual([]);
  });

  it("supports app-level default target", () => {
    const state = createEmptyStaveMuseState({ defaultTarget: "app" });
    expect(state.target.kind).toBe("app");
  });
});

describe("resolveStaveMuseLocalAction", () => {
  const todo = createWorkspaceTodoItem();
  todo.text = "release checklist";
  const ownerField = createWorkspaceInfoCustomField({
    type: "text",
    label: "Owner",
  });

  const context = {
    projectName: "Stave",
    projectPath: "/tmp/stave",
    projects: [
      {
        projectName: "Stave",
        projectPath: "/tmp/stave",
        isCurrent: true,
      },
    ],
    workspaces: [
      {
        id: "ws-main",
        name: "Default Workspace",
        branch: "main",
        isActive: true,
        isDefault: true,
      },
      {
        id: "ws-release",
        name: "release",
        branch: "release/1.0",
        isActive: false,
        isDefault: false,
      },
    ],
    tasks: [
      {
        id: "task-1",
        title: "Review release plan",
        isActive: true,
        isResponding: false,
      },
    ],
    activeTaskId: "task-1",
    workspaceInformation: {
      ...createEmptyWorkspaceInformation(),
      todos: [todo],
      customFields: [ownerField],
    },
  } as const;

  it("parses workspace switching requests", () => {
    expect(resolveStaveMuseLocalAction({
      input: "switch workspace release",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "switch_workspace",
      workspaceId: "ws-release",
      workspaceName: "release",
    });
  });

  it("parses scripts panel commands", () => {
    expect(resolveStaveMuseLocalAction({
      input: "open scripts",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "toggle_scripts_panel",
      open: true,
    });
  });

  it("parses natural-language task opening requests", () => {
    expect(resolveStaveMuseLocalAction({
      input: "Review release plan task를 사이드바 task 목록에서 직접 클릭해서 열어주세요.",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "select_task",
      taskId: "task-1",
      taskTitle: "Review release plan",
    });
  });

  it("parses direct information updates when enabled", () => {
    expect(resolveStaveMuseLocalAction({
      input: "complete todo release checklist",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "complete_todo",
      todoId: todo.id,
      todoText: "release checklist",
    });
    expect(resolveStaveMuseLocalAction({
      input: "set field \"Owner\" to platform",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "set_custom_field",
      fieldId: ownerField.id,
      fieldLabel: "Owner",
      value: "platform",
    });
  });

  it("does not parse direct information edits when disabled", () => {
    expect(resolveStaveMuseLocalAction({
      input: "complete todo release checklist",
      context,
      allowDirectWorkspaceInfoEdits: false,
    })).toBeNull();
  });
});

describe("buildStaveMuseContextSnapshot", () => {
  it("includes scope, project, workspaces, and information summary", () => {
    const snapshot = buildStaveMuseContextSnapshot({
      target: { kind: "workspace" },
      context: {
        projectName: "Stave",
        projectPath: "/tmp/stave",
        projects: [],
        workspaces: [{
          id: "ws-main",
          name: "Default Workspace",
          branch: "main",
          isActive: true,
          isDefault: true,
        }],
        tasks: [{
          id: "task-1",
          title: "Review release plan",
          isActive: true,
          isResponding: false,
        }],
        activeTaskId: "task-1",
        workspaceInformation: createEmptyWorkspaceInformation(),
      },
    });

    expect(snapshot).toContain("Stave Muse scope: Current Workspace");
    expect(snapshot).toContain("Current project: Stave");
    expect(snapshot).toContain("Default Workspace");
    expect(snapshot).toContain("Workspace Information:");
  });
});

describe("findStaveMuseWorkspaceMention", () => {
  it("matches the default workspace from free-form text", () => {
    expect(findStaveMuseWorkspaceMention({
      input: "stave default workspace 에 새 Task 열고 고쳐달라고 해",
      workspaces: [
        {
          id: "ws-main",
          name: "Default Workspace",
          branch: "main",
          isActive: false,
          isDefault: true,
        },
        {
          id: "ws-release",
          name: "release",
          branch: "release/1.0",
          isActive: true,
          isDefault: false,
        },
      ],
    })).toEqual({
      id: "ws-main",
      name: "Default Workspace",
      branch: "main",
      isActive: false,
      isDefault: true,
    });
  });
});

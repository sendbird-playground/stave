import { describe, expect, it } from "bun:test";
import {
  buildStaveAssistantContextSnapshot,
  createEmptyStaveAssistantState,
  resolveStaveAssistantLocalAction,
} from "@/lib/stave-assistant";
import { createEmptyWorkspaceInformation, createWorkspaceInfoCustomField, createWorkspaceTodoItem } from "@/lib/workspace-information";

describe("createEmptyStaveAssistantState", () => {
  it("defaults to the current project target", () => {
    const state = createEmptyStaveAssistantState();
    expect(state.target.kind).toBe("project");
    expect(state.messages).toEqual([]);
  });

  it("supports app-level default target", () => {
    const state = createEmptyStaveAssistantState({ defaultTarget: "app" });
    expect(state.target.kind).toBe("app");
  });
});

describe("resolveStaveAssistantLocalAction", () => {
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
    expect(resolveStaveAssistantLocalAction({
      input: "switch workspace release",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "switch_workspace",
      workspaceId: "ws-release",
      workspaceName: "release",
    });
  });

  it("parses automation panel commands", () => {
    expect(resolveStaveAssistantLocalAction({
      input: "open automation",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "toggle_automation_panel",
      open: true,
    });
  });

  it("parses direct information updates when enabled", () => {
    expect(resolveStaveAssistantLocalAction({
      input: "complete todo release checklist",
      context,
      allowDirectWorkspaceInfoEdits: true,
    })).toEqual({
      kind: "complete_todo",
      todoId: todo.id,
      todoText: "release checklist",
    });
    expect(resolveStaveAssistantLocalAction({
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
    expect(resolveStaveAssistantLocalAction({
      input: "complete todo release checklist",
      context,
      allowDirectWorkspaceInfoEdits: false,
    })).toBeNull();
  });
});

describe("buildStaveAssistantContextSnapshot", () => {
  it("includes scope, project, workspaces, and information summary", () => {
    const snapshot = buildStaveAssistantContextSnapshot({
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

    expect(snapshot).toContain("Stave Assistant scope: Current Workspace");
    expect(snapshot).toContain("Current project: Stave");
    expect(snapshot).toContain("Default Workspace");
    expect(snapshot).toContain("Workspace Information:");
  });
});

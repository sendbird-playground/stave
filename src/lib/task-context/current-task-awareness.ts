import type { CanonicalRetrievedContextPart } from "@/lib/providers/provider.types";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import type { Task } from "@/types/chat";

const MAX_TEXT_CHARS = 320;
const MAX_NOTES_CHARS = 600;
const MAX_VISIBLE_TASKS = 8;
const MAX_VISIBLE_RESOURCES = 5;
const MAX_VISIBLE_CUSTOM_FIELDS = 8;

function normalizeInlineText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function truncateText(value: string, maxChars = MAX_TEXT_CHARS) {
  const normalized = normalizeInlineText(value);
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function summarizeWorkspaceInformation(info: WorkspaceInformationState) {
  return [
    `Notes: ${info.notes.trim() ? "present" : "empty"}`,
    `Todos: ${info.todos.length}`,
    `Linked PRs: ${info.linkedPullRequests.length}`,
    `Jira: ${info.jiraIssues.length}`,
    `Confluence: ${info.confluencePages.length}`,
    `Figma: ${info.figmaResources.length}`,
    `Slack: ${info.slackThreads.length}`,
    `Custom fields: ${info.customFields.length}`,
  ].join("\n");
}

function formatSection(args: { label: string; items: string[]; emptyLabel: string }) {
  if (args.items.length === 0) {
    return [`${args.label}:`, `- ${args.emptyLabel}`];
  }
  return [
    `${args.label}:`,
    ...args.items.map((item) => `- ${truncateText(item)}`),
  ];
}

function buildWorkspaceInformationDetailLines(info: WorkspaceInformationState) {
  const noteSummary = info.notes.trim()
    ? truncateText(info.notes, MAX_NOTES_CHARS)
    : "empty";
  const todoItems = info.todos
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((todo) => `${todo.completed ? "[done]" : "[open]"} ${todo.text}`);
  const jiraItems = info.jiraIssues
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((issue) => [issue.issueKey || "Jira", issue.title, issue.status, issue.url, issue.note]
      .filter((value) => value.trim().length > 0)
      .join(" | "));
  const confluenceItems = info.confluencePages
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((page) => [page.title || "Confluence page", page.spaceKey, page.url, page.note]
      .filter((value) => value.trim().length > 0)
      .join(" | "));
  const figmaItems = info.figmaResources
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((resource) => [
      resource.title || "Figma resource",
      resource.nodeId ? `node ${resource.nodeId}` : "",
      resource.url,
      resource.note,
    ].filter((value) => value.trim().length > 0).join(" | "));
  const slackItems = info.slackThreads
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((thread) => [thread.channelName || "Slack thread", thread.url, thread.note]
      .filter((value) => value.trim().length > 0)
      .join(" | "));
  const linkedPrItems = info.linkedPullRequests
    .slice(0, MAX_VISIBLE_RESOURCES)
    .map((pullRequest) => [pullRequest.title || "Linked pull request", pullRequest.status, pullRequest.url, pullRequest.note]
      .filter((value) => value.trim().length > 0)
      .join(" | "));
  const customFieldItems = info.customFields
    .slice(0, MAX_VISIBLE_CUSTOM_FIELDS)
    .map((field) => {
      const value = field.type === "single_select"
        ? field.value || "(empty)"
        : field.type === "boolean"
          ? String(field.value)
          : field.type === "number"
            ? (field.value == null ? "(empty)" : String(field.value))
            : field.value.trim() || "(empty)";
      return `${field.label} = ${value}`;
    });

  return [
    ...formatSection({
      label: "Notes",
      items: [noteSummary],
      emptyLabel: "empty",
    }),
    ...formatSection({
      label: "Todos",
      items: todoItems,
      emptyLabel: "none",
    }),
    ...formatSection({
      label: "Linked pull requests",
      items: linkedPrItems,
      emptyLabel: "none",
    }),
    ...formatSection({
      label: "Jira issues",
      items: jiraItems,
      emptyLabel: "none",
    }),
    ...formatSection({
      label: "Confluence pages",
      items: confluenceItems,
      emptyLabel: "none",
    }),
    ...formatSection({
      label: "Figma resources",
      items: figmaItems,
      emptyLabel: "none",
    }),
    ...formatSection({
      label: "Slack threads",
      items: slackItems,
      emptyLabel: "none",
    }),
    ...formatSection({
      label: "Custom fields",
      items: customFieldItems,
      emptyLabel: "none",
    }),
  ];
}

export function buildCurrentTaskAwarenessRetrievedContext(args: {
  workspaceId: string;
  workspaceName?: string | null;
  workspacePath?: string | null;
  workspaceBranch?: string | null;
  projectName?: string | null;
  projectPath?: string | null;
  taskId: string;
  tasks: Task[];
  workspaceInformation: WorkspaceInformationState;
}): CanonicalRetrievedContextPart {
  const currentTask = args.tasks.find((task) => task.id === args.taskId) ?? null;
  const visibleTasks = args.tasks.slice(0, MAX_VISIBLE_TASKS).map((task) => (
    `${task.id === args.taskId ? "[current]" : "[other]"} ${truncateText(task.title, 140)}`
    + (task.id === args.taskId ? "" : ` | task id: ${task.id}`)
  ));

  const projectLines = [
    `- name: ${args.projectName?.trim() || "(unknown)"}`,
    `- path: ${args.projectPath?.trim() || "(unknown)"}`,
  ];
  const workspaceLines = [
    `- id: ${args.workspaceId}`,
    `- name: ${args.workspaceName?.trim() || "(unknown)"}`,
    `- root: ${args.workspacePath?.trim() || "(unknown)"}`,
    `- branch: ${args.workspaceBranch?.trim() || "(unknown)"}`,
  ];
  const taskLines = [
    `- id: ${args.taskId}`,
    `- title: ${currentTask?.title?.trim() || "(unknown)"}`,
    `- provider: ${currentTask?.provider ?? "(unknown)"}`,
  ];
  const workspaceConventionLines = [
    "- new workspace plan files belong under `.stave/context/plans`",
    "- use `.stave/context/plans/<taskIdPrefix>_<timestamp>.md` for new plan markdown files",
  ];

  return {
    type: "retrieved_context",
    sourceId: "stave:current-task-awareness",
    title: "Current Stave Task Context",
    content: [
      "Current Stave task chat context.",
      "This task belongs to the workspace below.",
      "Interpret unqualified references to \"this task\", \"current task\", \"this workspace\", \"current workspace\", and \"Information panel\" as referring to this task and its owning workspace unless the user clearly says otherwise.",
      "The Information panel is workspace-scoped, not task-scoped.",
      "Do not ask for workspaceId or taskId when the user's request clearly targets the current task or workspace. If the target is ambiguous, ask a normal clarification in chat instead.",
      "",
      "Project:",
      ...projectLines,
      "",
      "Workspace:",
      ...workspaceLines,
      "",
      "Task:",
      ...taskLines,
      "",
      "Workspace Conventions:",
      ...workspaceConventionLines,
      "",
      "Visible tasks in this workspace:",
      ...(visibleTasks.length > 0 ? visibleTasks.map((task) => `- ${task}`) : ["- none"]),
      "",
      "Workspace Information Summary:",
      summarizeWorkspaceInformation(args.workspaceInformation),
      "",
      "Workspace Information Details:",
      ...buildWorkspaceInformationDetailLines(args.workspaceInformation),
    ].join("\n"),
  };
}

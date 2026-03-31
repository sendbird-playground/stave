import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildCanonicalConversationRequest } from "../../src/lib/providers/canonical-request";
import { getDefaultModelForProvider } from "../../src/lib/providers/model-catalog";
import type {
  NormalizedProviderEvent,
  ProviderId,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import type { AppNotificationCreateInput } from "../../src/lib/notifications/notification.types";
import { workspaceHasActiveTurns } from "../../src/lib/notifications/notification.types";
import {
  buildPendingProviderTurnState,
  buildRecentTimestamp,
} from "../../src/store/chat-state-helpers";
import { applyApprovalState, applyUserInputState } from "../../src/store/editor.utils";
import {
  buildProjectDefaultWorkspaceId,
  buildWorkspaceCreationNotice,
  buildWorkspaceRootNodeModulesSymlinkCommand,
  normalizeProjectDisplayName,
  normalizeProjectWorkspaceRootNodeModulesSymlinkPreference,
  normalizeRecentProjectStates,
  normalizeWorkspaceInitCommand,
  resolveCurrentProjectDefaultWorkspaceId,
  resolveProjectNameFromPath,
  resolveProjectWorkspaceInitCommand,
  resolveProjectWorkspaceRootNodeModulesSymlinkPreference,
  sanitizeBranchName,
  summarizeTerminalCommandDetail,
  summarizeWorkspaceInitCommand,
  toWorkspaceFolderName,
  upsertRecentProjectState,
  type RecentProjectState,
} from "../../src/store/project.utils";
import {
  buildWorkspaceSessionState,
  createEmptyWorkspaceState,
  createWorkspaceSnapshot,
  defaultWorkspaceName,
  type WorkspaceSessionState,
} from "../../src/store/workspace-session-state";
import { applyProviderEventsToWorkspaceSession } from "../../src/store/workspace-turn-replay";
import {
  findLatestPendingApprovalPart,
  findLatestPendingUserInputPart,
  findPendingApprovalMessageByRequestId,
} from "../../src/store/provider-message.utils";
import type { ChatMessage, Task } from "../../src/types/chat";
import { providerRuntime } from "../providers/runtime";
import type { BridgeEvent } from "../providers/types";
import { ensurePersistenceReady } from "./state";
import { runCommand } from "./utils/command";
import { toEventType } from "./utils/provider-events";

export interface RegisteredWorkspaceInfo {
  id: string;
  name: string;
  updatedAt: string;
  path: string;
  branch: string;
  isDefault: boolean;
}

export interface RegisteredProjectInfo {
  projectPath: string;
  projectName: string;
  defaultBranch: string;
  activeWorkspaceId: string;
  defaultWorkspaceId: string;
  workspaces: RegisteredWorkspaceInfo[];
}

export interface CreatedWorkspaceInfo {
  workspaceId: string;
  workspaceName: string;
  workspacePath: string;
  branch: string;
  projectPath: string;
  projectName: string;
  noticeLevel?: "success" | "warning";
  message?: string;
}

export interface TaskRunResult {
  workspaceId: string;
  taskId: string;
  taskTitle: string;
  turnId: string;
  provider: ProviderId;
  model: string;
}

export interface TaskStatusResult {
  workspaceId: string;
  taskId: string;
  title: string;
  provider: ProviderId;
  updatedAt: string;
  activeTurnId: string | null;
  latestTurnId: string | null;
  latestTurnCompletedAt: string | null;
  messageCount: number;
  latestAssistantText: string | null;
  pendingApprovals: Array<{
    messageId: string;
    requestId: string;
    toolName: string;
    description: string;
  }>;
  pendingUserInputs: Array<{
    messageId: string;
    requestId: string;
    toolName: string;
    questionCount: number;
  }>;
}

const workspaceSessionCacheById = new Map<string, WorkspaceSessionState>();
const workspacePersistChainById = new Map<string, Promise<void>>();

function normalizeProjectPath(projectPath: string) {
  return path.resolve(projectPath.trim());
}

async function assertDirectoryExists(projectPath: string) {
  const stat = await fs.stat(projectPath);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${projectPath}`);
  }
}

async function detectDefaultBranch(projectPath: string) {
  const branchResult = await runCommand({
    cwd: projectPath,
    command: "git symbolic-ref --short refs/remotes/origin/HEAD || git symbolic-ref --short HEAD || echo main",
  });
  const branchLine = (branchResult.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return branchLine ? branchLine.replace(/^origin\//, "") : "main";
}

function createEmptyWorkspaceSnapshot() {
  const empty = createEmptyWorkspaceState();
  return createWorkspaceSnapshot({
    activeTaskId: empty.activeTaskId,
    tasks: empty.tasks,
    messagesByTask: empty.messagesByTask,
    promptDraftByTask: empty.promptDraftByTask,
    editorTabs: empty.editorTabs,
    activeEditorTabId: empty.activeEditorTabId,
    providerConversationByTask: empty.providerConversationByTask,
  });
}

function toWorkspaceList(project: RecentProjectState): RegisteredWorkspaceInfo[] {
  return project.workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    updatedAt: workspace.updatedAt,
    path: project.workspacePathById[workspace.id] ?? project.projectPath,
    branch: project.workspaceBranchById[workspace.id] ?? project.defaultBranch,
    isDefault: Boolean(project.workspaceDefaultById[workspace.id]),
  }));
}

async function persistWorkspaceSession(args: {
  workspaceId: string;
  workspaceName: string;
  session: WorkspaceSessionState;
}) {
  const store = await ensurePersistenceReady();
  store.upsertWorkspace({
    id: args.workspaceId,
    name: args.workspaceName,
    snapshot: createWorkspaceSnapshot({
      activeTaskId: args.session.activeTaskId,
      tasks: args.session.tasks,
      messagesByTask: args.session.messagesByTask,
      promptDraftByTask: args.session.promptDraftByTask,
      editorTabs: args.session.editorTabs,
      activeEditorTabId: args.session.activeEditorTabId,
      providerConversationByTask: args.session.providerConversationByTask,
    }) as never,
  });
}

function queueWorkspaceSessionPersist(args: {
  workspaceId: string;
  workspaceName: string;
  session: WorkspaceSessionState;
}) {
  const previous = workspacePersistChainById.get(args.workspaceId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(() => persistWorkspaceSession(args))
    .catch((error) => {
      console.error("[stave-mcp] failed to persist workspace session", error, {
        workspaceId: args.workspaceId,
      });
    });
  workspacePersistChainById.set(args.workspaceId, next);
  return next;
}

async function loadNormalizedProjects() {
  const store = await ensurePersistenceReady();
  return {
    store,
    projects: normalizeRecentProjectStates({
      projects: store.loadProjectRegistry() as RecentProjectState[],
    }),
  };
}

async function saveNormalizedProjects(projects: RecentProjectState[]) {
  const store = await ensurePersistenceReady();
  store.saveProjectRegistry({
    projects: normalizeRecentProjectStates({ projects }) as never[],
  });
}

function findProjectByPath(projects: RecentProjectState[], projectPath: string) {
  return projects.find((project) => project.projectPath === projectPath) ?? null;
}

function findWorkspaceRegistration(args: {
  projects: RecentProjectState[];
  workspaceId: string;
}) {
  for (const project of args.projects) {
    const workspace = project.workspaces.find((item) => item.id === args.workspaceId) ?? null;
    if (!workspace) {
      continue;
    }
    return {
      project,
      workspace,
      workspacePath: project.workspacePathById[workspace.id] ?? project.projectPath,
      branch: project.workspaceBranchById[workspace.id] ?? project.defaultBranch,
    };
  }
  return null;
}

async function ensureProjectRegistryEntry(args: {
  projectPath: string;
  projectName?: string;
  defaultBranch?: string;
}) {
  const projectPath = normalizeProjectPath(args.projectPath);
  await assertDirectoryExists(projectPath);
  const resolvedProjectName = normalizeProjectDisplayName({
    projectPath,
    projectName: args.projectName?.trim() || resolveProjectNameFromPath({ projectPath }),
  });
  const defaultBranch = args.defaultBranch?.trim() || await detectDefaultBranch(projectPath);
  const now = new Date().toISOString();

  const { store, projects } = await loadNormalizedProjects();
  const existingProject = findProjectByPath(projects, projectPath);
  const defaultWorkspaceId = existingProject
    ? resolveCurrentProjectDefaultWorkspaceId({
        projectPath,
        workspaces: existingProject.workspaces,
        workspaceDefaultById: existingProject.workspaceDefaultById,
      })
    : buildProjectDefaultWorkspaceId({ projectPath });
  const existingSnapshot = store.loadWorkspaceSnapshot({ workspaceId: defaultWorkspaceId });

  if (!existingSnapshot) {
    store.upsertWorkspace({
      id: defaultWorkspaceId,
      name: defaultWorkspaceName,
      snapshot: createEmptyWorkspaceSnapshot() as never,
    });
  }

  const nextProject: RecentProjectState = existingProject
    ? {
        ...existingProject,
        projectName: resolvedProjectName,
        defaultBranch,
        lastOpenedAt: now,
        activeWorkspaceId: existingProject.activeWorkspaceId || defaultWorkspaceId,
        workspaceBranchById: {
          ...existingProject.workspaceBranchById,
          [defaultWorkspaceId]: existingProject.workspaceBranchById[defaultWorkspaceId] || defaultBranch,
        },
        workspacePathById: {
          ...existingProject.workspacePathById,
          [defaultWorkspaceId]: existingProject.workspacePathById[defaultWorkspaceId] || projectPath,
        },
        workspaceDefaultById: {
          ...existingProject.workspaceDefaultById,
          [defaultWorkspaceId]: true,
        },
        workspaces: existingProject.workspaces.some((workspace) => workspace.id === defaultWorkspaceId)
          ? existingProject.workspaces
          : [{ id: defaultWorkspaceId, name: defaultWorkspaceName, updatedAt: now }, ...existingProject.workspaces],
      }
    : {
        projectPath,
        projectName: resolvedProjectName,
        lastOpenedAt: now,
        defaultBranch,
        workspaces: [{ id: defaultWorkspaceId, name: defaultWorkspaceName, updatedAt: now }],
        activeWorkspaceId: defaultWorkspaceId,
        workspaceBranchById: { [defaultWorkspaceId]: defaultBranch },
        workspacePathById: { [defaultWorkspaceId]: projectPath },
        workspaceDefaultById: { [defaultWorkspaceId]: true },
        newWorkspaceInitCommand: "",
        newWorkspaceUseRootNodeModulesSymlink: false,
      };

  const nextProjects = upsertRecentProjectState({
    projects,
    project: nextProject,
  });
  await saveNormalizedProjects(nextProjects);

  return {
    projectPath,
    projectName: resolvedProjectName,
    defaultBranch,
    project: nextProject,
    defaultWorkspaceId,
  };
}

async function loadWorkspaceSession(workspaceId: string) {
  const cached = workspaceSessionCacheById.get(workspaceId);
  if (cached) {
    return cached;
  }

  const store = await ensurePersistenceReady();
  const snapshot = store.loadWorkspaceSnapshot({ workspaceId });
  if (!snapshot) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  const latestTurns = store.listLatestTurnsForWorkspace({ workspaceId, limit: 200 });
  const session = buildWorkspaceSessionState({
    snapshot: snapshot as never,
    latestTurns: latestTurns as never,
  });
  workspaceSessionCacheById.set(workspaceId, session);
  return session;
}

function cacheWorkspaceSession(workspaceId: string, session: WorkspaceSessionState) {
  workspaceSessionCacheById.set(workspaceId, session);
  return session;
}

function buildTaskTitleFromPrompt(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 48) || "New Task";
}

function findPendingApprovals(messages: ChatMessage[]) {
  const pending: Array<{
    messageId: string;
    requestId: string;
    toolName: string;
    description: string;
  }> = [];

  for (const message of messages) {
    const approvalPart = findLatestPendingApprovalPart({ message });
    if (!approvalPart) {
      continue;
    }
    pending.push({
      messageId: message.id,
      requestId: approvalPart.requestId,
      toolName: approvalPart.toolName,
      description: approvalPart.description,
    });
  }

  return pending;
}

function findPendingUserInputs(messages: ChatMessage[]) {
  const pending: Array<{
    messageId: string;
    requestId: string;
    toolName: string;
    questionCount: number;
  }> = [];

  for (const message of messages) {
    const userInputPart = findLatestPendingUserInputPart({ message });
    if (!userInputPart) {
      continue;
    }
    pending.push({
      messageId: message.id,
      requestId: userInputPart.requestId,
      toolName: userInputPart.toolName,
      questionCount: userInputPart.questions.length,
    });
  }

  return pending;
}

async function persistNotification(notification: AppNotificationCreateInput) {
  try {
    const store = await ensurePersistenceReady();
    store.createNotification({ notification: notification as never });
  } catch (error) {
    console.warn("[stave-mcp] failed to persist notification", error, {
      kind: notification.kind,
      workspaceId: notification.workspaceId,
      taskId: notification.taskId,
      turnId: notification.turnId,
    });
  }
}

async function persistApprovalNotification(args: {
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  event: Extract<NormalizedProviderEvent, { type: "approval" }>;
  session: WorkspaceSessionState;
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  const taskTitle = args.session.tasks.find((task) => task.id === args.taskId)?.title ?? "Task";
  const location = findPendingApprovalMessageByRequestId({
    messages: args.session.messagesByTask[args.taskId] ?? [],
    requestId: args.event.requestId,
  });
  await persistNotification({
    id: randomUUID(),
    kind: "task.approval_requested",
    title: taskTitle,
    body: `${args.event.toolName}: ${args.event.description}`,
    projectPath: registration?.project.projectPath ?? null,
    projectName: registration?.project.projectName ?? null,
    workspaceId: args.workspaceId,
    workspaceName: registration?.workspace.name ?? null,
    taskId: args.taskId,
    taskTitle,
    turnId: args.turnId,
    providerId: args.provider,
    action: {
      type: "approval",
      requestId: args.event.requestId,
      messageId: location?.messageId ?? null,
    },
    payload: {
      toolName: args.event.toolName,
      description: args.event.description,
    },
    dedupeKey: `task.approval_requested:${args.turnId}:${args.event.requestId}`,
  });
}

async function persistTurnCompletedNotification(args: {
  workspaceId: string;
  taskId: string;
  turnId: string;
  provider: ProviderId;
  event: Extract<NormalizedProviderEvent, { type: "done" }>;
  session: WorkspaceSessionState;
}) {
  if (workspaceHasActiveTurns({ activeTurnIdsByTask: args.session.activeTurnIdsByTask })) {
    return;
  }

  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  const taskTitle = args.session.tasks.find((task) => task.id === args.taskId)?.title ?? "Task";

  await persistNotification({
    id: randomUUID(),
    kind: "task.turn_completed",
    title: taskTitle,
    body: `Latest run finished in ${registration?.workspace.name ?? args.workspaceId}.`,
    projectPath: registration?.project.projectPath ?? null,
    projectName: registration?.project.projectName ?? null,
    workspaceId: args.workspaceId,
    workspaceName: registration?.workspace.name ?? null,
    taskId: args.taskId,
    taskTitle,
    turnId: args.turnId,
    providerId: args.provider,
    action: null,
    payload: {
      stopReason: args.event.stop_reason ?? null,
    },
    dedupeKey: `task.turn_completed:${args.turnId}`,
  });
}

async function handleProviderEvent(args: {
  workspaceId: string;
  workspaceName: string;
  taskId: string;
  provider: ProviderId;
  model: string;
  turnId: string;
  event: BridgeEvent;
}) {
  const store = await ensurePersistenceReady();
  const session = await loadWorkspaceSession(args.workspaceId);
  const applied = applyProviderEventsToWorkspaceSession({
    session,
    taskId: args.taskId,
    events: [args.event as NormalizedProviderEvent],
    provider: args.provider,
    model: args.model,
    turnId: args.turnId,
  });
  cacheWorkspaceSession(args.workspaceId, applied.session);
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName: args.workspaceName,
    session: applied.session,
  });

  if (args.event.type === "approval") {
    await persistApprovalNotification({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
      provider: args.provider,
      event: args.event,
      session: applied.session,
    });
  }
  if (args.event.type === "done") {
    await persistTurnCompletedNotification({
      workspaceId: args.workspaceId,
      taskId: args.taskId,
      turnId: args.turnId,
      provider: args.provider,
      event: args.event,
      session: applied.session,
    });
    store.completeTurn({ id: args.turnId });
  }
}

export async function registerProject(args: {
  projectPath: string;
  projectName?: string;
  defaultBranch?: string;
}) {
  const ensured = await ensureProjectRegistryEntry(args);
  return {
    projectPath: ensured.projectPath,
    projectName: ensured.project.projectName,
    defaultBranch: ensured.project.defaultBranch,
    activeWorkspaceId: ensured.project.activeWorkspaceId,
    defaultWorkspaceId: ensured.defaultWorkspaceId,
    workspaces: toWorkspaceList(ensured.project),
  } satisfies RegisteredProjectInfo;
}

export async function createWorkspace(args: {
  projectPath: string;
  name: string;
  mode: "branch" | "clean";
  fromBranch?: string;
  initCommand?: string;
  useRootNodeModulesSymlink?: boolean;
}) {
  const trimmedName = args.name.trim();
  if (!trimmedName) {
    throw new Error("Workspace name is required.");
  }

  const ensured = await ensureProjectRegistryEntry({
    projectPath: args.projectPath,
  });
  const projectPath = ensured.projectPath;
  const project = ensured.project;
  const branchName = sanitizeBranchName({ value: trimmedName });
  if (!branchName) {
    throw new Error("Workspace branch name is invalid.");
  }

  const existingWorkspace = toWorkspaceList(project).find((workspace) => (
    workspace.branch === branchName
    || workspace.name === branchName
    || workspace.path === `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: branchName })}`
  )) ?? null;
  if (existingWorkspace) {
    return {
      workspaceId: existingWorkspace.id,
      workspaceName: existingWorkspace.name,
      workspacePath: existingWorkspace.path,
      branch: existingWorkspace.branch,
      projectPath,
      projectName: project.projectName,
      message: "Workspace already exists.",
      noticeLevel: "warning",
    } satisfies CreatedWorkspaceInfo;
  }

  const workspaceId = randomUUID();
  const workspacePath = `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: branchName })}`;
  const baseBranch = args.fromBranch?.trim() || project.defaultBranch || ensured.defaultBranch || "main";
  const initCommand = normalizeWorkspaceInitCommand({
    value: args.initCommand ?? resolveProjectWorkspaceInitCommand({
      projectPath,
      recentProjects: [project],
    }),
  });
  const useRootNodeModulesSymlink = args.useRootNodeModulesSymlink === undefined
    ? resolveProjectWorkspaceRootNodeModulesSymlinkPreference({
        projectPath,
        recentProjects: [project],
      })
    : normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
        value: args.useRootNodeModulesSymlink,
      });

  await runCommand({
    cwd: projectPath,
    command: "mkdir -p .stave/workspaces",
  });
  const addResult = await runCommand({
    cwd: projectPath,
    command: args.mode === "clean"
      ? `git worktree add -b ${JSON.stringify(branchName)} ${JSON.stringify(workspacePath)}`
      : `git worktree add -b ${JSON.stringify(branchName)} ${JSON.stringify(workspacePath)} ${JSON.stringify(baseBranch)}`,
  });
  if (!addResult.ok) {
    const fallbackResult = await runCommand({
      cwd: projectPath,
      command: `git worktree add ${JSON.stringify(workspacePath)} ${JSON.stringify(branchName)}`,
    });
    if (!fallbackResult.ok) {
      throw new Error((fallbackResult.stderr || addResult.stderr || "Failed to create git worktree.").trim());
    }
  }

  const notices: Array<{ level: "success" | "warning"; message: string }> = [];

  if (useRootNodeModulesSymlink) {
    const linkResult = await runCommand({
      cwd: workspacePath,
      command: buildWorkspaceRootNodeModulesSymlinkCommand({ projectPath }),
    });
    if (linkResult.ok) {
      notices.push({
        level: "success",
        message: "Linked `node_modules` from the repository root into the new workspace.",
      });
    } else {
      notices.push({
        level: "warning",
        message: `Linking the shared root \`node_modules\` failed. ${summarizeTerminalCommandDetail({
          stderr: linkResult.stderr,
          stdout: linkResult.stdout,
          fallback: "Command failed.",
        })}`,
      });
    }
  }

  if (initCommand) {
    const initResult = await runCommand({
      cwd: workspacePath,
      command: initCommand,
    });
    const summarizedCommand = summarizeWorkspaceInitCommand({ command: initCommand });
    if (initResult.ok) {
      notices.push({
        level: "success",
        message: `Ran the post-create command: ${summarizedCommand}`,
      });
    } else {
      notices.push({
        level: "warning",
        message: `The post-create command failed: ${summarizedCommand}. ${summarizeTerminalCommandDetail({
          stderr: initResult.stderr,
          stdout: initResult.stdout,
          fallback: "Command failed.",
        })}`,
      });
    }
  }

  const store = await ensurePersistenceReady();
  const snapshot = createEmptyWorkspaceSnapshot();
  store.upsertWorkspace({
    id: workspaceId,
    name: branchName,
    snapshot: snapshot as never,
  });
  cacheWorkspaceSession(workspaceId, buildWorkspaceSessionState({ snapshot: snapshot as never }));

  const now = new Date().toISOString();
  const nextProject: RecentProjectState = {
    ...project,
    lastOpenedAt: now,
    activeWorkspaceId: workspaceId,
    workspaces: [...project.workspaces, { id: workspaceId, name: branchName, updatedAt: now }],
    workspaceBranchById: {
      ...project.workspaceBranchById,
      [workspaceId]: branchName,
    },
    workspacePathById: {
      ...project.workspacePathById,
      [workspaceId]: workspacePath,
    },
    workspaceDefaultById: {
      ...project.workspaceDefaultById,
      [workspaceId]: false,
    },
  };
  const { projects } = await loadNormalizedProjects();
  await saveNormalizedProjects(upsertRecentProjectState({
    projects,
    project: nextProject,
  }));

  const notice = buildWorkspaceCreationNotice({ notices });
  return {
    workspaceId,
    workspaceName: branchName,
    workspacePath,
    branch: branchName,
    projectPath,
    projectName: project.projectName,
    ...(notice ?? {}),
  } satisfies CreatedWorkspaceInfo;
}

export async function runTask(args: {
  workspaceId: string;
  prompt: string;
  taskId?: string;
  title?: string;
  provider?: ProviderId;
  runtimeOptions?: ProviderRuntimeOptions;
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    throw new Error(`Workspace not found: ${args.workspaceId}`);
  }

  const workspacePath = registration.workspacePath;
  const workspaceName = registration.workspace.name;
  let session = await loadWorkspaceSession(args.workspaceId);
  const provider = args.provider ?? "stave";
  const model = args.runtimeOptions?.model?.trim() || getDefaultModelForProvider({
    providerId: provider,
  });

  let task = args.taskId
    ? session.tasks.find((item) => item.id === args.taskId) ?? null
    : null;

  if (!task) {
    const taskId = args.taskId?.trim() || randomUUID();
    task = {
      id: taskId,
      title: args.title?.trim() || buildTaskTitleFromPrompt(args.prompt),
      provider,
      updatedAt: buildRecentTimestamp(),
      unread: false,
      archivedAt: null,
      controlMode: "managed",
      controlOwner: "external",
    } satisfies Task;
    session = cacheWorkspaceSession(args.workspaceId, {
      ...session,
      activeTaskId: task.id,
      tasks: [task, ...session.tasks],
      messagesByTask: {
        ...session.messagesByTask,
        [task.id]: session.messagesByTask[task.id] ?? [],
      },
      nativeConversationReadyByTask: {
        ...session.nativeConversationReadyByTask,
        [task.id]: false,
      },
    });
  } else if (task.controlMode !== "managed" || task.controlOwner !== "external") {
    task = {
      ...task,
      controlMode: "managed",
      controlOwner: "external",
      updatedAt: buildRecentTimestamp(),
    } satisfies Task;
    session = cacheWorkspaceSession(args.workspaceId, {
      ...session,
      tasks: session.tasks.map((item) => item.id === task!.id ? task! : item),
    });
  }

  if (session.activeTurnIdsByTask[task.id]) {
    throw new Error(`Task already has an active turn: ${task.id}`);
  }

  const turnId = randomUUID();
  const existingHistory = session.messagesByTask[task.id] ?? [];
  const providerConversation = session.providerConversationByTask[task.id];
  const conversation = buildCanonicalConversationRequest({
    turnId,
    taskId: task.id,
    workspaceId: args.workspaceId,
    providerId: provider,
    model,
    history: existingHistory,
    userInput: args.prompt,
    mode: "chat",
    nativeConversationId: providerConversation?.[provider] ?? null,
  });
  const pendingState = buildPendingProviderTurnState({
    tasks: session.tasks,
    messagesByTask: session.messagesByTask,
    activeTurnIdsByTask: session.activeTurnIdsByTask,
    taskWorkspaceIdById: {},
    workspaceSnapshotVersion: 0,
    taskId: task.id,
    taskWorkspaceId: args.workspaceId,
    turnId,
    provider,
    activeModel: model,
    content: args.prompt,
  });
  session = cacheWorkspaceSession(args.workspaceId, {
    ...session,
    activeTaskId: task.id,
    tasks: pendingState.tasks,
    messagesByTask: pendingState.messagesByTask,
    activeTurnIdsByTask: pendingState.activeTurnIdsByTask,
  });
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName,
    session,
  });

  const store = await ensurePersistenceReady();
  let sequence = 0;
  store.beginTurn({
    id: turnId,
    workspaceId: args.workspaceId,
    taskId: task.id,
    providerId: provider,
  });
  store.appendTurnEvent({
    id: randomUUID(),
    turnId,
    sequence: 0,
    eventType: "request_snapshot",
    payload: {
      type: "request_snapshot",
      prompt: args.prompt,
      conversation,
    },
  });

  const started = providerRuntime.startTurnStream({
    turnId,
    providerId: provider,
    prompt: args.prompt,
    conversation,
    taskId: task.id,
    workspaceId: args.workspaceId,
    cwd: workspacePath,
    runtimeOptions: {
      ...args.runtimeOptions,
      model,
    },
  }, {
    onEvent: (event) => {
      sequence += 1;
      try {
        store.appendTurnEvent({
          id: randomUUID(),
          turnId,
          sequence,
          eventType: toEventType({ event }),
          payload: event,
        });
      } catch (error) {
        console.warn("[stave-mcp] failed to append turn event", error, {
          turnId,
          sequence,
          workspaceId: args.workspaceId,
          taskId: task.id,
        });
      }

      void handleProviderEvent({
        workspaceId: args.workspaceId,
        workspaceName,
        taskId: task.id,
        provider,
        model,
        turnId,
        event,
      });
    },
  });

  if (!started.ok) {
    throw new Error("Failed to start provider turn.");
  }

  return {
    workspaceId: args.workspaceId,
    taskId: task.id,
    taskTitle: task.title,
    turnId,
    provider,
    model,
  } satisfies TaskRunResult;
}

export async function getTaskStatus(args: {
  workspaceId: string;
  taskId: string;
}) {
  const session = await loadWorkspaceSession(args.workspaceId);
  const task = session.tasks.find((item) => item.id === args.taskId);
  if (!task) {
    throw new Error(`Task not found: ${args.taskId}`);
  }

  const store = await ensurePersistenceReady();
  const latestTurn = store.listTurns({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    limit: 1,
  })[0] ?? null;
  const messages = session.messagesByTask[args.taskId] ?? [];
  const latestAssistantText = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim().length > 0)
    ?.content ?? null;

  return {
    workspaceId: args.workspaceId,
    taskId: task.id,
    title: task.title,
    provider: task.provider,
    updatedAt: task.updatedAt,
    activeTurnId: session.activeTurnIdsByTask[task.id] ?? null,
    latestTurnId: latestTurn?.id ?? null,
    latestTurnCompletedAt: latestTurn?.completedAt ?? null,
    messageCount: messages.length,
    latestAssistantText,
    pendingApprovals: findPendingApprovals(messages),
    pendingUserInputs: findPendingUserInputs(messages),
  } satisfies TaskStatusResult;
}

export async function listTurnEvents(args: {
  turnId: string;
  afterSequence?: number;
  limit?: number;
}) {
  const store = await ensurePersistenceReady();
  return store.listTurnEvents(args);
}

function findApprovalMessage(args: {
  messages: ChatMessage[];
  requestId: string;
}) {
  for (const message of args.messages) {
    const approvalPart = findLatestPendingApprovalPart({ message });
    if (approvalPart?.requestId === args.requestId) {
      return {
        messageId: message.id,
        part: approvalPart,
      };
    }
  }
  return null;
}

function findUserInputMessage(args: {
  messages: ChatMessage[];
  requestId: string;
}) {
  for (const message of args.messages) {
    const userInputPart = findLatestPendingUserInputPart({ message });
    if (userInputPart?.requestId === args.requestId) {
      return {
        messageId: message.id,
        part: userInputPart,
      };
    }
  }
  return null;
}

export async function respondApproval(args: {
  workspaceId: string;
  taskId: string;
  requestId: string;
  approved: boolean;
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    throw new Error(`Workspace not found: ${args.workspaceId}`);
  }

  const session = await loadWorkspaceSession(args.workspaceId);
  const activeTurnId = session.activeTurnIdsByTask[args.taskId];
  if (!activeTurnId) {
    throw new Error(`No active turn found for task ${args.taskId}.`);
  }

  const messages = session.messagesByTask[args.taskId] ?? [];
  const approval = findApprovalMessage({
    messages,
    requestId: args.requestId,
  });
  if (!approval) {
    throw new Error(`Pending approval not found: ${args.requestId}`);
  }

  const result = providerRuntime.respondApproval({
    turnId: activeTurnId,
    requestId: args.requestId,
    approved: args.approved,
  });
  if (!result.ok) {
    throw new Error(result.message);
  }

  const nextMessagesState = applyApprovalState({
    messagesByTask: session.messagesByTask,
    workspaceSnapshotVersion: 0,
    taskId: args.taskId,
    messageId: approval.messageId,
    requestId: args.requestId,
    approved: args.approved,
  });
  const nextSession = cacheWorkspaceSession(args.workspaceId, {
    ...session,
    messagesByTask: nextMessagesState.messagesByTask,
  });
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName: registration.workspace.name,
    session: nextSession,
  });
  return {
    ok: true,
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    requestId: args.requestId,
    approved: args.approved,
  };
}

export async function respondUserInput(args: {
  workspaceId: string;
  taskId: string;
  requestId: string;
  answers?: Record<string, string>;
  denied?: boolean;
}) {
  const { projects } = await loadNormalizedProjects();
  const registration = findWorkspaceRegistration({
    projects,
    workspaceId: args.workspaceId,
  });
  if (!registration) {
    throw new Error(`Workspace not found: ${args.workspaceId}`);
  }

  const session = await loadWorkspaceSession(args.workspaceId);
  const activeTurnId = session.activeTurnIdsByTask[args.taskId];
  if (!activeTurnId) {
    throw new Error(`No active turn found for task ${args.taskId}.`);
  }

  const messages = session.messagesByTask[args.taskId] ?? [];
  const userInput = findUserInputMessage({
    messages,
    requestId: args.requestId,
  });
  if (!userInput) {
    throw new Error(`Pending user input not found: ${args.requestId}`);
  }

  const result = providerRuntime.respondUserInput({
    turnId: activeTurnId,
    requestId: args.requestId,
    answers: args.answers,
    denied: args.denied,
  });
  if (!result.ok) {
    throw new Error(result.message);
  }

  const nextMessagesState = applyUserInputState({
    messagesByTask: session.messagesByTask,
    workspaceSnapshotVersion: 0,
    taskId: args.taskId,
    messageId: userInput.messageId,
    requestId: args.requestId,
    answers: args.answers,
    denied: args.denied,
  });
  const nextSession = cacheWorkspaceSession(args.workspaceId, {
    ...session,
    messagesByTask: nextMessagesState.messagesByTask,
  });
  await queueWorkspaceSessionPersist({
    workspaceId: args.workspaceId,
    workspaceName: registration.workspace.name,
    session: nextSession,
  });
  return {
    ok: true,
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    requestId: args.requestId,
    denied: args.denied === true,
  };
}

export async function listKnownProjects() {
  const { projects } = await loadNormalizedProjects();
  return projects.map((project) => ({
    projectPath: project.projectPath,
    projectName: project.projectName,
    defaultBranch: project.defaultBranch,
    activeWorkspaceId: project.activeWorkspaceId,
    defaultWorkspaceId: resolveCurrentProjectDefaultWorkspaceId({
      projectPath: project.projectPath,
      workspaces: project.workspaces,
      workspaceDefaultById: project.workspaceDefaultById,
    }),
    workspaces: toWorkspaceList(project),
  }));
}

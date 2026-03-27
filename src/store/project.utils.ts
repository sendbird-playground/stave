import type { WorkspaceSummary } from "@/lib/db/workspaces.db";
import type { Task } from "@/types/chat";
import { defaultWorkspaceName, starterWorkspaceId, type WorkspaceSessionState } from "@/store/workspace-session-state";
import { normalizeComparablePath } from "@/lib/source-control-worktrees";

const MAX_RECENT_PROJECTS = 12;

export interface RecentProjectState {
  projectPath: string;
  projectName: string;
  lastOpenedAt: string;
  defaultBranch: string;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  newWorkspaceInitCommand?: string;
  newWorkspaceUseRootNodeModulesSymlink?: boolean;
}

export function normalizeWorkspaceInitCommand(args: { value?: string | null }) {
  return args.value?.trim() ?? "";
}

export function normalizeProjectWorkspaceInitCommand(args: { value?: string | null }) {
  return normalizeWorkspaceInitCommand({ value: args.value });
}

export function normalizeProjectWorkspaceRootNodeModulesSymlinkPreference(args: { value?: boolean | null }) {
  return args.value === true;
}

export function resolveProjectWorkspaceInitCommand(args: {
  projectPath?: string | null;
  recentProjects: RecentProjectState[];
}) {
  const projectPath = args.projectPath?.trim();
  if (!projectPath) {
    return "";
  }
  const project = args.recentProjects.find((item) => item.projectPath === projectPath);
  return normalizeProjectWorkspaceInitCommand({ value: project?.newWorkspaceInitCommand });
}

export function resolveProjectWorkspaceRootNodeModulesSymlinkPreference(args: {
  projectPath?: string | null;
  recentProjects: RecentProjectState[];
}) {
  const projectPath = args.projectPath?.trim();
  if (!projectPath) {
    return false;
  }
  const project = args.recentProjects.find((item) => item.projectPath === projectPath);
  return normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
    value: project?.newWorkspaceUseRootNodeModulesSymlink,
  });
}

export function summarizeTerminalCommandDetail(args: { stdout?: string; stderr?: string; fallback: string }) {
  const detail = (args.stderr || args.stdout || "").trim();
  if (!detail) {
    return args.fallback;
  }

  return detail.split("\n")[0]?.trim().slice(0, 240) || args.fallback;
}

export function summarizeWorkspaceInitCommand(args: { command: string; maxLength?: number }) {
  const normalized = normalizeWorkspaceInitCommand({ value: args.command });
  const maxLength = args.maxLength ?? 96;
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function buildWorkspaceRootNodeModulesSymlinkCommand(args: { projectPath: string }) {
  const sourcePath = `${args.projectPath}/node_modules`;
  return [
    "if [ -e node_modules ] || [ -L node_modules ]; then",
    "  echo \"node_modules already exists; skipping shared root symlink.\"",
    `elif [ ! -e ${JSON.stringify(sourcePath)} ] && [ ! -L ${JSON.stringify(sourcePath)} ]; then`,
    "  echo \"Repository root is missing node_modules; cannot create shared symlink.\" >&2",
    "  exit 1",
    "else",
    `  ln -s ${JSON.stringify(sourcePath)} node_modules`,
    "fi",
  ].join("\n");
}

export function buildWorkspaceCreationNotice(args: {
  notices: Array<{ level: "success" | "warning"; message: string }>;
}): { noticeLevel: "success" | "warning"; message: string } | undefined {
  if (args.notices.length === 0) {
    return undefined;
  }

  const noticeLevel = args.notices.some((notice) => notice.level === "warning") ? "warning" : "success";
  return {
    noticeLevel,
    message: `Workspace created${noticeLevel === "warning" ? ", with warnings" : ""}. ${args.notices.map((notice) => notice.message).join(" ")}`,
  };
}

export function registerTaskWorkspaceOwnership(args: {
  taskWorkspaceIdById: Record<string, string>;
  workspaceId: string;
  tasks: Task[];
}) {
  const next = { ...args.taskWorkspaceIdById };
  for (const task of args.tasks) {
    next[task.id] = args.workspaceId;
  }
  return next;
}

export function resolveWorkspaceName(args: {
  state: Pick<{ workspaces: WorkspaceSummary[]; recentProjects: RecentProjectState[] }, "workspaces" | "recentProjects">;
  workspaceId: string;
}) {
  const activeWorkspaceName = args.state.workspaces.find((workspace) => workspace.id === args.workspaceId)?.name;
  if (activeWorkspaceName) {
    return activeWorkspaceName;
  }
  for (const project of args.state.recentProjects) {
    const workspaceName = project.workspaces.find((workspace) => workspace.id === args.workspaceId)?.name;
    if (workspaceName) {
      return workspaceName;
    }
  }
  return defaultWorkspaceName;
}

export function removeWorkspaceRuntimeCacheEntries(args: {
  workspaceRuntimeCacheById: Record<string, WorkspaceSessionState>;
  workspaceIds: string[];
}) {
  if (args.workspaceIds.length === 0) {
    return args.workspaceRuntimeCacheById;
  }
  const ids = new Set(args.workspaceIds);
  return Object.fromEntries(
    Object.entries(args.workspaceRuntimeCacheById).filter(([workspaceId]) => !ids.has(workspaceId))
  );
}

export function areStringArraysEqual(left: string[], right: string[]) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= items.length
    || toIndex >= items.length
    || fromIndex === toIndex
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (typeof moved === "undefined") {
    return items;
  }
  next.splice(toIndex, 0, moved);
  return next;
}

export function sanitizeBranchName(args: { value: string }) {
  return args.value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._/-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^\-|\-$/g, "");
}

export function toWorkspaceFolderName(args: { branch: string }) {
  return args.branch.replaceAll("/", "__");
}

export function resolveProjectNameFromPath(args: { projectPath: string }) {
  return args.projectPath
    .split(/[\\/]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .at(-1) ?? "project";
}

export function hashProjectPath(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildProjectDefaultWorkspaceId(args: { projectPath?: string | null }) {
  const projectPath = args.projectPath?.trim();
  return projectPath ? `base:${hashProjectPath(normalizeComparablePath(projectPath))}` : starterWorkspaceId;
}

export function buildImportedWorktreeWorkspaceId(args: { projectPath: string; worktreePath: string }) {
  return `worktree:${hashProjectPath(`${normalizeComparablePath(args.projectPath)}::${normalizeComparablePath(args.worktreePath)}`)}`;
}

export function resolveImportedWorktreeName(args: { branch?: string | null; worktreePath: string }) {
  return args.branch?.trim() || resolveProjectNameFromPath({ projectPath: args.worktreePath });
}

export function resolveCurrentProjectDefaultWorkspaceId(args: {
  projectPath?: string | null;
  workspaces: WorkspaceSummary[];
  workspaceDefaultById: Record<string, boolean>;
}) {
  const rememberedDefaultWorkspaceId = Object.entries(args.workspaceDefaultById)
    .find(([, isDefault]) => isDefault)?.[0];
  if (rememberedDefaultWorkspaceId) {
    return rememberedDefaultWorkspaceId;
  }
  return args.workspaces.find((workspace) => workspace.id === starterWorkspaceId)?.id
    ?? args.workspaces.find((workspace) => workspace.name.toLowerCase() === defaultWorkspaceName.toLowerCase())?.id
    ?? buildProjectDefaultWorkspaceId({ projectPath: args.projectPath });
}

export function cloneRecentProjectState(project: RecentProjectState): RecentProjectState {
  return {
    ...project,
    workspaces: [...project.workspaces],
    workspaceBranchById: { ...project.workspaceBranchById },
    workspacePathById: { ...project.workspacePathById },
    workspaceDefaultById: { ...project.workspaceDefaultById },
    newWorkspaceInitCommand: normalizeProjectWorkspaceInitCommand({
      value: project.newWorkspaceInitCommand,
    }),
    newWorkspaceUseRootNodeModulesSymlink: normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
      value: project.newWorkspaceUseRootNodeModulesSymlink,
    }),
  };
}

export function normalizeRecentProjectStates(args: { projects?: RecentProjectState[] | null }) {
  let normalizedProjects: RecentProjectState[] = [];

  for (const project of args.projects ?? []) {
    const projectPath = project?.projectPath?.trim();
    if (!projectPath) {
      continue;
    }

    const lastOpenedAt = project.lastOpenedAt?.trim() || new Date().toISOString();
    const defaultBranch = project.defaultBranch?.trim() || "main";
    const workspaceBranchById = { ...(project.workspaceBranchById ?? {}) };
    const workspacePathById = { ...(project.workspacePathById ?? {}) };
    const workspaceDefaultById = { ...(project.workspaceDefaultById ?? {}) };
    const providedWorkspaces = Array.isArray(project.workspaces)
      ? project.workspaces.filter((workspace) => Boolean(workspace?.id && workspace?.name))
      : [];
    const initialDefaultWorkspaceId = resolveCurrentProjectDefaultWorkspaceId({
      projectPath,
      workspaces: providedWorkspaces,
      workspaceDefaultById,
    });
    const workspaces = providedWorkspaces.length > 0
      ? providedWorkspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          updatedAt: workspace.updatedAt || lastOpenedAt,
        }))
      : [{
          id: initialDefaultWorkspaceId,
          name: defaultWorkspaceName,
          updatedAt: lastOpenedAt,
        }];
    const defaultWorkspaceId = resolveCurrentProjectDefaultWorkspaceId({
      projectPath,
      workspaces,
      workspaceDefaultById,
    });
    const activeWorkspaceId = workspaces.some((workspace) => workspace.id === project.activeWorkspaceId)
      ? project.activeWorkspaceId
      : defaultWorkspaceId;

    workspaceBranchById[defaultWorkspaceId] = workspaceBranchById[defaultWorkspaceId] || defaultBranch;
    workspacePathById[defaultWorkspaceId] = workspacePathById[defaultWorkspaceId] || projectPath;
    normalizedProjects = upsertRecentProjectState({
      projects: normalizedProjects,
      project: {
        projectPath,
        projectName: project.projectName?.trim() || resolveProjectNameFromPath({ projectPath }),
        lastOpenedAt,
        defaultBranch,
        workspaces,
        activeWorkspaceId,
        workspaceBranchById,
        workspacePathById,
        workspaceDefaultById: {
          ...workspaceDefaultById,
          [defaultWorkspaceId]: true,
        },
        newWorkspaceInitCommand: normalizeProjectWorkspaceInitCommand({
          value: project.newWorkspaceInitCommand,
        }),
        newWorkspaceUseRootNodeModulesSymlink: normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
          value: project.newWorkspaceUseRootNodeModulesSymlink,
        }),
      },
    });
  }

  return normalizedProjects;
}

export function upsertRecentProjectState(args: { projects: RecentProjectState[]; project: RecentProjectState }) {
  const nextProject = cloneRecentProjectState(args.project);
  const existingIndex = args.projects.findIndex((item) => item.projectPath === args.project.projectPath);
  if (existingIndex >= 0) {
    return args.projects.map((item, index) => (index === existingIndex ? nextProject : cloneRecentProjectState(item)));
  }
  return [...args.projects.map((project) => cloneRecentProjectState(project)), nextProject]
    .slice(-MAX_RECENT_PROJECTS);
}

export function captureCurrentProjectState(args: {
  recentProjects: RecentProjectState[];
  projectPath: string | null;
  workspaceRootName: string | null;
  defaultBranch: string;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
}): RecentProjectState[] {
  if (!args.projectPath) {
    return args.recentProjects.map((project) => cloneRecentProjectState(project));
  }
  return upsertRecentProjectState({
    projects: args.recentProjects,
    project: {
      projectPath: args.projectPath,
      projectName: args.workspaceRootName ?? "project",
      lastOpenedAt: new Date().toISOString(),
      defaultBranch: args.defaultBranch,
      workspaces: args.workspaces,
      activeWorkspaceId: args.activeWorkspaceId,
      workspaceBranchById: args.workspaceBranchById,
      workspacePathById: args.workspacePathById,
      workspaceDefaultById: args.workspaceDefaultById,
      newWorkspaceInitCommand: resolveProjectWorkspaceInitCommand({
        projectPath: args.projectPath,
        recentProjects: args.recentProjects,
      }),
      newWorkspaceUseRootNodeModulesSymlink: resolveProjectWorkspaceRootNodeModulesSymlinkPreference({
        projectPath: args.projectPath,
        recentProjects: args.recentProjects,
      }),
    },
  });
}

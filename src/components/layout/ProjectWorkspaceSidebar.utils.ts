export interface ProjectSidebarWorkspaceView {
  id: string;
  name: string;
  isDefault: boolean;
  branch?: string;
}

export interface ProjectSidebarCollapsedProjectView {
  projectPath: string;
  projectName: string;
  workspaces: ProjectSidebarWorkspaceView[];
  activeWorkspaceId: string;
  isCurrent: boolean;
}

const WORKSPACE_ROW_ACTION_REVEAL_CLASSES =
  "group-hover/workspace-row:pointer-events-auto group-hover/workspace-row:opacity-100 group-has-[:focus-visible]/workspace-row:pointer-events-auto group-has-[:focus-visible]/workspace-row:opacity-100";

export interface CollapsedWorkspaceEntry {
  projectPath: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  isDefault: boolean;
  branch?: string;
  isActive: boolean;
  startsProjectGroup: boolean;
}

export function buildCollapsedWorkspaceEntries(args: {
  projects: ProjectSidebarCollapsedProjectView[];
  activeWorkspaceId: string;
}): CollapsedWorkspaceEntry[] {
  return args.projects.reduce<CollapsedWorkspaceEntry[]>((entries, project) => {
    const startsAfterPreviousProject = entries.length > 0;

    for (const [workspaceIndex, workspace] of project.workspaces.entries()) {
      entries.push({
        projectPath: project.projectPath,
        projectName: project.projectName,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        isDefault: workspace.isDefault,
        branch: workspace.branch,
        isActive:
          project.isCurrent && workspace.id === args.activeWorkspaceId,
        startsProjectGroup:
          startsAfterPreviousProject && workspaceIndex === 0,
      });
    }

    return entries;
  }, []);
}

export function getWorkspaceArchiveButtonVisibilityClasses(args: {
  isClosing: boolean;
}) {
  return args.isClosing
    ? "pointer-events-auto opacity-100"
    : `pointer-events-none opacity-0 ${WORKSPACE_ROW_ACTION_REVEAL_CLASSES}`;
}

export function getWorkspaceRespondingCountVisibilityClasses(args: {
  canArchiveWorkspace: boolean;
  isClosing: boolean;
}) {
  if (!args.canArchiveWorkspace) {
    return "";
  }

  return args.isClosing
    ? "opacity-0"
    : "group-hover/workspace-row:opacity-0 group-has-[:focus-visible]/workspace-row:opacity-0";
}

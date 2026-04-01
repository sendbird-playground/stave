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

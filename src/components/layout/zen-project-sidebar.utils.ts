export interface ZenProjectListItem {
  projectName: string;
  projectPath: string;
  isCurrent: boolean;
}

interface ZenProjectRecord {
  projectName: string;
  projectPath: string;
}

function formatProjectLabel(args: { projectName: string | null; projectPath: string }) {
  const trimmedName = args.projectName?.trim();
  if (trimmedName) {
    return trimmedName;
  }
  const normalizedPath = args.projectPath.replace(/[\\/]+$/, "");
  return normalizedPath.split(/[/\\]/).at(-1) || "Project";
}

export function buildZenProjectList(args: {
  currentProjectName: string | null;
  currentProjectPath: string | null;
  recentProjects: ZenProjectRecord[];
}): ZenProjectListItem[] {
  const rememberedProjects = args.recentProjects
    .filter((project) => project.projectPath.trim().length > 0)
    .map((project) => ({
      projectName: formatProjectLabel({
        projectName: project.projectName,
        projectPath: project.projectPath,
      }),
      projectPath: project.projectPath,
      isCurrent: project.projectPath === args.currentProjectPath,
    }));

  if (!args.currentProjectPath?.trim()) {
    return rememberedProjects;
  }

  const currentProject: ZenProjectListItem = {
    projectName: formatProjectLabel({
      projectName: args.currentProjectName,
      projectPath: args.currentProjectPath,
    }),
    projectPath: args.currentProjectPath,
    isCurrent: true,
  };

  const withoutCurrent = rememberedProjects.filter((project) => project.projectPath !== args.currentProjectPath);
  return [currentProject, ...withoutCurrent];
}

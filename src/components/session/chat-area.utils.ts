export type ChatAreaViewMode =
  | "no_project"
  | "hydrating_project"
  | "no_workspace"
  | "no_task"
  | "empty_task"
  | "conversation";

export function resolveChatAreaViewMode(args: {
  projectPath: string | null;
  hasHydratedWorkspaces: boolean;
  hasAnyWorkspace: boolean;
  hasSelectedWorkspace: boolean;
  hasSelectedTask: boolean;
  activeTaskMessageCount: number;
}): ChatAreaViewMode {
  if (!args.projectPath) {
    return "no_project";
  }
  if (!args.hasHydratedWorkspaces) {
    return "hydrating_project";
  }
  if (args.hasAnyWorkspace && !args.hasSelectedWorkspace) {
    return "no_workspace";
  }
  if (!args.hasSelectedTask) {
    return "no_task";
  }
  return args.activeTaskMessageCount === 0 ? "empty_task" : "conversation";
}

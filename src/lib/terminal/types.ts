export interface WorkspaceTerminalTab {
  id: string;
  title: string;
  linkedTaskId: string | null;
  backend: "xterm";
  cwd: string;
  createdAt: number;
}

export interface TerminalCreateSessionArgs {
  workspaceId: string;
  workspacePath: string;
  taskId: string | null;
  taskTitle: string | null;
  terminalTabId: string;
  cwd: string;
  shell?: string;
  cols?: number;
  rows?: number;
  deliveryMode?: "poll" | "push";
}

export function getTerminalTabDefaultTitle(args: {
  cwd: string;
  linkedTaskTitle?: string | null;
}) {
  const linkedTaskTitle = args.linkedTaskTitle?.trim();
  if (linkedTaskTitle) {
    return linkedTaskTitle;
  }

  const normalizedPath = args.cwd.trim().replace(/[\\/]+$/, "");
  const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? "Terminal";
}

export function getWorkspaceTerminalTabKey(args: {
  workspaceId: string;
  terminalTabId: string;
}) {
  return `${args.workspaceId}:${args.terminalTabId}`;
}

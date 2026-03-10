export function parseWorktreePathByBranch(args: { stdout: string }) {
  const worktreePathByBranch: Record<string, string> = {};
  let currentWorktreePath = "";

  for (const rawLine of args.stdout.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) {
      currentWorktreePath = "";
      continue;
    }
    if (line.startsWith("worktree ")) {
      currentWorktreePath = line.slice("worktree ".length).trim();
      continue;
    }
    if (!currentWorktreePath || !line.startsWith("branch refs/heads/")) {
      continue;
    }

    const branch = line.slice("branch refs/heads/".length).trim();
    if (branch) {
      worktreePathByBranch[branch] = currentWorktreePath;
    }
  }

  return worktreePathByBranch;
}

export function normalizeComparablePath(value?: string | null) {
  return value ? value.replace(/\\/g, "/").replace(/\/+$/, "") : "";
}

export function isBranchAttachedElsewhere(args: {
  branch: string;
  workspacePath?: string | null;
  worktreePathByBranch: Record<string, string>;
}) {
  const attachedPath = args.worktreePathByBranch[args.branch];
  if (!attachedPath) {
    return false;
  }

  return normalizeComparablePath(attachedPath) !== normalizeComparablePath(args.workspacePath);
}

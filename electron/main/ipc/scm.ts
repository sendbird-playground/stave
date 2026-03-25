import { ipcMain } from "electron";
import { promises as fs } from "node:fs";
import { parseWorktreePathByBranch } from "../../../src/lib/source-control-worktrees";
import { buildSourceControlDiffPreview, resolveSourceControlDiffPaths } from "../../../src/lib/source-control-diff";
import { hasConflictItems, parseStatusLines, quotePath, resolveCommandCwd, runCommand } from "../utils/command";
import { resolveRootFilePath } from "../utils/filesystem";

function toGitPathspecArg(paths: string[]) {
  return paths.map((filePath) => `"${quotePath({ value: filePath })}"`).join(" ");
}

async function readGitHeadFile(args: { cwd?: string; filePath: string }) {
  const result = await runCommand({
    command: `git show HEAD:"${quotePath({ value: args.filePath })}"`,
    cwd: args.cwd,
  });
  return result.ok ? result.stdout : "";
}

async function readWorkingTreeFile(args: { cwd?: string; filePath: string }) {
  const cwd = resolveCommandCwd({ cwd: args.cwd });
  const absolutePath = resolveRootFilePath({ rootPath: cwd, filePath: args.filePath });
  if (!absolutePath) {
    return "";
  }

  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch {
    return "";
  }
}

export function registerScmHandlers() {
  ipcMain.handle("scm:status", async (_event, args: { cwd?: string }) => {
    const statusResult = await runCommand({ command: "git status --porcelain", cwd: args.cwd });
    const branchResult = await runCommand({ command: "git rev-parse --abbrev-ref HEAD", cwd: args.cwd });
    const items = statusResult.ok ? parseStatusLines({ stdout: statusResult.stdout }) : [];
    return {
      ok: statusResult.ok && branchResult.ok,
      branch: branchResult.ok ? branchResult.stdout.trim() : "unknown",
      items,
      hasConflicts: hasConflictItems({ items }),
      stderr: [statusResult.stderr, branchResult.stderr].filter(Boolean).join("\n").trim(),
    };
  });

  ipcMain.handle("scm:stage-all", async (_event, args: { cwd?: string }) => runCommand({ command: "git add -A", cwd: args.cwd }));
  ipcMain.handle("scm:unstage-all", async (_event, args: { cwd?: string }) => runCommand({ command: "git restore --staged .", cwd: args.cwd }));

  ipcMain.handle("scm:commit", async (_event, args: { message: string; cwd?: string }) => {
    const message = args.message.trim();
    if (!message) {
      return { ok: false, code: -1, stdout: "", stderr: "Commit message is required." };
    }
    const escapedMessage = message.replaceAll('"', '\\"');
    return runCommand({ command: `git commit -m "${escapedMessage}"`, cwd: args.cwd });
  });

  ipcMain.handle("scm:stage-file", async (_event, args: { path: string; cwd?: string }) => {
    const safePath = quotePath({ value: args.path });
    return runCommand({ command: `git add -- "${safePath}"`, cwd: args.cwd });
  });

  ipcMain.handle("scm:unstage-file", async (_event, args: { path: string; cwd?: string }) => {
    const safePath = quotePath({ value: args.path });
    return runCommand({ command: `git restore --staged -- "${safePath}"`, cwd: args.cwd });
  });

  ipcMain.handle("scm:diff", async (_event, args: { path: string; cwd?: string }) => {
    const paths = resolveSourceControlDiffPaths({ rawPath: args.path });
    const pathspecArg = toGitPathspecArg(paths.pathspecs);
    const [staged, unstaged, oldContent, newContent] = await Promise.all([
      runCommand({ command: `git diff --cached -- ${pathspecArg}`, cwd: args.cwd }),
      runCommand({ command: `git diff -- ${pathspecArg}`, cwd: args.cwd }),
      readGitHeadFile({ cwd: args.cwd, filePath: paths.headPath }),
      readWorkingTreeFile({ cwd: args.cwd, filePath: paths.workingTreePath }),
    ]);
    const content = buildSourceControlDiffPreview({
      stagedPatch: staged.stdout,
      unstagedPatch: unstaged.stdout,
    });

    return {
      ok: unstaged.ok || staged.ok,
      content,
      oldContent,
      newContent,
      stderr: [staged.stderr, unstaged.stderr].filter(Boolean).join("\n").trim(),
    };
  });

  ipcMain.handle("scm:discard-file", async (_event, args: { path: string; cwd?: string }) => {
    const safePath = quotePath({ value: args.path });
    return runCommand({ command: `git restore -- "${safePath}"`, cwd: args.cwd });
  });

  ipcMain.handle("scm:history", async (_event, args: { cwd?: string; limit?: number }) => {
    const limit = Math.max(1, Math.min(50, args.limit ?? 20));
    const result = await runCommand({
      command: `git log -n ${limit} --pretty=format:%h%x09%ad%x09%s --date=relative`,
      cwd: args.cwd,
    });
    const items = result.ok
      ? result.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [hash = "", relativeDate = "", subject = ""] = line.split("\t");
            return { hash, relativeDate, subject };
          })
      : [];

    return { ok: result.ok, items, stderr: result.stderr };
  });

  ipcMain.handle("scm:list-branches", async (_event, args: { cwd?: string }) => {
    const listResult = await runCommand({ command: "git branch --format='%(refname:short)'", cwd: args.cwd });
    const currentResult = await runCommand({ command: "git rev-parse --abbrev-ref HEAD", cwd: args.cwd });
    const worktreeResult = await runCommand({ command: "git worktree list --porcelain", cwd: args.cwd });

    return {
      ok: listResult.ok && currentResult.ok,
      current: currentResult.ok ? currentResult.stdout.trim() : "unknown",
      branches: listResult.ok
        ? listResult.stdout
            .split("\n")
            .map((name) => name.trim())
            .filter(Boolean)
        : [],
      worktreePathByBranch: worktreeResult.ok ? parseWorktreePathByBranch({ stdout: worktreeResult.stdout }) : {},
      stderr: [listResult.stderr, currentResult.stderr].filter(Boolean).join("\n").trim(),
    };
  });

  ipcMain.handle("scm:create-branch", async (_event, args: { name: string; cwd?: string; from?: string }) => {
    const name = args.name.trim();
    if (!name) {
      return { ok: false, code: -1, stdout: "", stderr: "Branch name is required." };
    }
    const safeName = quotePath({ value: name });
    const fromRef = args.from?.trim();
    const command = fromRef
      ? `git branch "${safeName}" "${quotePath({ value: fromRef })}"`
      : `git branch "${safeName}"`;
    return runCommand({ command, cwd: args.cwd });
  });

  ipcMain.handle("scm:checkout-branch", async (_event, args: { name: string; cwd?: string }) => {
    const name = args.name.trim();
    if (!name) {
      return { ok: false, code: -1, stdout: "", stderr: "Branch name is required." };
    }
    const safeName = quotePath({ value: name });
    return runCommand({ command: `git checkout "${safeName}"`, cwd: args.cwd });
  });

  ipcMain.handle("scm:merge-branch", async (_event, args: { branch: string; cwd?: string }) => {
    const branch = args.branch.trim();
    if (!branch) {
      return { ok: false, code: -1, stdout: "", stderr: "Branch name is required." };
    }
    return runCommand({ command: `git merge "${quotePath({ value: branch })}"`, cwd: args.cwd });
  });

  ipcMain.handle("scm:rebase-branch", async (_event, args: { branch: string; cwd?: string }) => {
    const branch = args.branch.trim();
    if (!branch) {
      return { ok: false, code: -1, stdout: "", stderr: "Branch name is required." };
    }
    return runCommand({ command: `git rebase "${quotePath({ value: branch })}"`, cwd: args.cwd });
  });

  ipcMain.handle("scm:cherry-pick", async (_event, args: { commit: string; cwd?: string }) => {
    const commit = args.commit.trim();
    if (!commit) {
      return { ok: false, code: -1, stdout: "", stderr: "Commit hash is required." };
    }
    return runCommand({ command: `git cherry-pick "${quotePath({ value: commit })}"`, cwd: args.cwd });
  });

  ipcMain.handle(
    "scm:graph-log",
    async (_event, args: { cwd?: string; limit?: number; skip?: number; branch?: string }) => {
      const limit = Math.max(1, Math.min(500, args.limit ?? 100));
      const skip = Math.max(0, args.skip ?? 0);

      const branchFilter = args.branch?.trim();
      const branchArg = branchFilter ? `"${quotePath({ value: branchFilter })}"` : "--all";

      const result = await runCommand({
        command: `git log ${branchArg} -n ${limit} --skip=${skip} --pretty=format:%H%x09%P%x09%an%x09%ae%x09%aI%x09%s%x09%D`,
        cwd: args.cwd,
      });

      if (!result.ok) {
        return { ok: false, commits: [], hasMore: false, stderr: result.stderr };
      }

      const commits = result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const parts = line.split("\t");
          const hash = parts[0] ?? "";
          const parentStr = parts[1] ?? "";
          const authorName = parts[2] ?? "";
          const authorEmail = parts[3] ?? "";
          const authorDateISO = parts[4] ?? "";
          const subject = parts[5] ?? "";
          const refsStr = parts[6] ?? "";

          return {
            hash,
            abbrevHash: hash.slice(0, 7),
            parents: parentStr ? parentStr.split(" ") : [],
            authorName,
            authorEmail,
            authorDateISO,
            subject,
            refs: refsStr ? refsStr.split(", ").map((r) => r.trim()).filter(Boolean) : [],
          };
        });

      return { ok: true, commits, hasMore: commits.length === limit, stderr: "" };
    },
  );

  ipcMain.handle("scm:commit-detail", async (_event, args: { hash: string; cwd?: string }) => {
    const hash = args.hash.trim();
    if (!hash) {
      return { ok: false, hash: "", parents: [], authorName: "", authorEmail: "", authorDateISO: "", body: "", refs: [], files: [], stderr: "Commit hash is required." };
    }
    const safeHash = quotePath({ value: hash });

    const [showResult, diffTreeResult] = await Promise.all([
      runCommand({
        command: `git show --no-patch --pretty=format:%H%x00%P%x00%an%x00%ae%x00%aI%x00%B%x00%D "${safeHash}"`,
        cwd: args.cwd,
      }),
      runCommand({
        command: `git diff-tree --no-commit-id -r --name-status "${safeHash}"`,
        cwd: args.cwd,
      }),
    ]);

    if (!showResult.ok) {
      return { ok: false, hash, parents: [], authorName: "", authorEmail: "", authorDateISO: "", body: "", refs: [], files: [], stderr: showResult.stderr };
    }

    const parts = showResult.stdout.split("\0");
    const commitHash = parts[0] ?? "";
    const parentStr = parts[1] ?? "";
    const authorName = parts[2] ?? "";
    const authorEmail = parts[3] ?? "";
    const authorDateISO = parts[4] ?? "";
    const body = (parts[5] ?? "").trim();
    const refsStr = parts[6] ?? "";

    const files = diffTreeResult.ok
      ? diffTreeResult.stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [status = "", ...pathParts] = line.split("\t");
            return { status, path: pathParts.join("\t") };
          })
      : [];

    return {
      ok: true,
      hash: commitHash,
      parents: parentStr ? parentStr.split(" ") : [],
      authorName,
      authorEmail,
      authorDateISO,
      body,
      refs: refsStr ? refsStr.split(", ").map((r) => r.trim()).filter(Boolean) : [],
      files,
      stderr: "",
    };
  });
}

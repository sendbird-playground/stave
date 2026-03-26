import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, FileCode2, Folder, FolderTree, GitBranch, GitPullRequest, TerminalSquare } from "lucide-react";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, toast } from "@/components/ui";
import { isBranchAttachedElsewhere } from "@/lib/source-control-worktrees";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { WorkspaceIdentityMark } from "@/components/layout/workspace-accent";

function parseGitHubOwnerRepo(remoteUrl: string) {
  const normalized = remoteUrl.trim().replace(/\.git$/i, "");
  const sshLikeMatch = normalized.match(/^(?:git@|ssh:\/\/git@)github\.com[:/]([^/]+\/[^/]+)$/i);
  if (sshLikeMatch?.[1]) {
    return sshLikeMatch[1];
  }
  const httpsLikeMatch = normalized.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  if (httpsLikeMatch?.[1]) {
    return httpsLikeMatch[1];
  }
  return null;
}

function formatWorkspacePathLabel(args: { workspacePath?: string; projectPath?: string | null }) {
  const workspacePath = args.workspacePath?.trim();
  if (!workspacePath) {
    return "Workspace Folder";
  }

  const projectPath = args.projectPath?.trim();
  if (projectPath && workspacePath.startsWith(`${projectPath}/`)) {
    return workspacePath.slice(projectPath.length + 1);
  }

  return workspacePath;
}

export function WorkspaceBar() {
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [worktreePathByBranch, setWorktreePathByBranch] = useState<Record<string, string>>({});
  const [currentBranch, setCurrentBranch] = useState("main");
  const [branchError, setBranchError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [
    isEditorOpen,
    sidebarOverlayVisible,
    isTerminalOpen,
    setLayout,
    workspaces,
    activeWorkspaceId,
    workspaceDefaultById,
    workspaceBranchById,
    workspacePathById,
    projectPath,
    defaultBranch,
    setWorkspaceBranch,
  ] = useAppStore(useShallow((state) => [
    state.layout.editorVisible,
    state.layout.sidebarOverlayVisible,
    state.layout.terminalDocked,
    state.setLayout,
    state.workspaces,
    state.activeWorkspaceId,
    state.workspaceDefaultById,
    state.workspaceBranchById,
    state.workspacePathById,
    state.projectPath,
    state.defaultBranch,
    state.setWorkspaceBranch,
  ] as const));

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const rawWorkspaceName = activeWorkspace?.name ?? "Default Workspace";
  const isDefaultWorkspace = Boolean(workspaceDefaultById[activeWorkspaceId]);
  const activeWorkspaceBranch = workspaceBranchById[activeWorkspaceId];
  const isDefaultLabel = rawWorkspaceName.toLowerCase() === "default workspace";
  const workspaceName = isDefaultLabel ? "Default" : rawWorkspaceName;

  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;
  const workspacePathLabel = formatWorkspacePathLabel({
    workspacePath: workspacePathById[activeWorkspaceId],
    projectPath,
  });

  async function loadBranches() {
    const listBranches = window.api?.sourceControl?.listBranches;
    if (!listBranches) {
      setBranchError("Source Control bridge unavailable.");
      return;
    }

    setIsBusy(true);
    const result = await listBranches({ cwd: workspaceCwd });
    if (!result.ok) {
      setBranchError(result.stderr || "Failed to load branches.");
      setIsBusy(false);
      return;
    }
    setCurrentBranch(result.current || workspaceBranchById[activeWorkspaceId] || "main");
    setBranches(result.branches);
    setWorktreePathByBranch(result.worktreePathByBranch ?? {});
    setBranchError("");
    setIsBusy(false);
  }

  useEffect(() => {
    if (!branchOpen || !isDefaultWorkspace) {
      return;
    }
    void loadBranches();
  }, [branchOpen, isDefaultWorkspace, activeWorkspaceId]);

  useEffect(() => {
    const next = activeWorkspaceBranch;
    if (next) {
      setCurrentBranch(next);
    }
  }, [activeWorkspaceBranch]);

  useEffect(() => {
    if (isDefaultWorkspace) {
      return;
    }
    setBranchOpen(false);
    setBranchFilter("");
    setNewBranchName("");
  }, [isDefaultWorkspace]);

  const filteredBranches = useMemo(() => {
    const normalized = branchFilter.trim().toLowerCase();
    return branches.filter((branch) => {
      if (isBranchAttachedElsewhere({
        branch,
        workspacePath: workspaceCwd,
        worktreePathByBranch,
      })) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return branch.toLowerCase().includes(normalized);
    });
  }, [branchFilter, branches, workspaceCwd, worktreePathByBranch]);

  async function handleCreateBranch() {
    const createBranch = window.api?.sourceControl?.createBranch;
    if (!createBranch) {
      setBranchError("Create branch bridge unavailable.");
      return;
    }

    const targetName = newBranchName.trim();
    if (!targetName) {
      return;
    }

    setIsBusy(true);
    const result = await createBranch({ name: targetName, from: currentBranch, cwd: workspaceCwd });
    if (!result.ok) {
      setBranchError(result.stderr || "Branch creation failed.");
      setIsBusy(false);
      return;
    }
    setNewBranchName("");
    await loadBranches();
    setIsBusy(false);
  }

  async function handleOpenPR() {
    const runCommand = window.api?.terminal?.runCommand;
    if (!runCommand) {
      setBranchError("Terminal bridge unavailable.");
      toast.error("Unable to open PR", { description: "Terminal bridge unavailable." });
      return;
    }

    const lookupCwds = [workspaceCwd, projectPath].filter((value, index, array): value is string =>
      Boolean(value) && array.indexOf(value) === index
    );

    let ownerRepo: string | null = null;
    for (const cwd of lookupCwds) {
      for (const remoteName of ["origin", "upstream"]) {
        const remoteResult = await runCommand({ command: `git remote get-url ${remoteName}`, cwd });
        if (!remoteResult?.ok) {
          continue;
        }
        ownerRepo = parseGitHubOwnerRepo(remoteResult.stdout);
        if (ownerRepo) {
          break;
        }
      }
      if (ownerRepo) {
        break;
      }
    }

    if (!ownerRepo) {
      setBranchError("Could not resolve a GitHub remote for this workspace.");
      toast.error("Unable to open PR", { description: "GitHub remote not found." });
      return;
    }

    const branch = workspaceBranchById[activeWorkspaceId] ?? currentBranch;
    const openExternal = window.api?.shell?.openExternal;
    if (!openExternal) {
      setBranchError("Shell bridge unavailable.");
      toast.error("Unable to open PR", { description: "Shell bridge unavailable." });
      return;
    }

    const baseBranch = defaultBranch.trim() || "main";
    const comparePath = `${encodeURIComponent(baseBranch)}...${encodeURIComponent(branch)}`;

    try {
      const result = await openExternal({ url: `https://github.com/${ownerRepo}/compare/${comparePath}?expand=1` });
      if (!result.ok) {
        setBranchError(result.stderr || "Failed to open GitHub compare view.");
        toast.error("Unable to open PR", {
          description: result.stderr || "Failed to open GitHub compare view.",
        });
        return;
      }
      setBranchError("");
      toast.success("Opened in browser", {
        description: "GitHub compare page opened in your default browser.",
      });
    } catch {
      setBranchError("Failed to open GitHub compare view.");
      toast.error("Unable to open PR", { description: "Failed to open GitHub compare view." });
    }
  }

  async function handleCheckoutBranch(args: { name: string }) {
    const checkoutBranch = window.api?.sourceControl?.checkoutBranch;
    if (!checkoutBranch) {
      const message = "Checkout bridge unavailable.";
      setBranchError(message);
      toast.error("Branch checkout failed", { description: message });
      return false;
    }

    if (args.name === currentBranch) {
      return false;
    }

    const blockedByWorktree = isBranchAttachedElsewhere({
      branch: args.name,
      workspacePath: workspaceCwd,
      worktreePathByBranch,
    });
    if (blockedByWorktree) {
      const attachedPath = worktreePathByBranch[args.name];
      const message = attachedPath
        ? `Branch "${args.name}" is already checked out in ${formatWorkspacePathLabel({ workspacePath: attachedPath, projectPath })}.`
        : `Branch "${args.name}" is already checked out in another worktree.`;
      setBranchError(message);
      toast.error("Branch unavailable", { description: message });
      return false;
    }

    setIsBusy(true);
    const result = await checkoutBranch({ name: args.name, cwd: workspaceCwd });
    if (!result.ok) {
      const message = result.stderr || "Branch checkout failed.";
      setBranchError(message);
      toast.error("Branch checkout failed", { description: message });
      setIsBusy(false);
      return false;
    }
    setWorkspaceBranch({ workspaceId: activeWorkspaceId, branch: args.name });
    setCurrentBranch(args.name);
    await loadBranches();
    setIsBusy(false);
    return true;
  }

  return (
    <div data-testid="workspace-bar" className="relative z-20 flex h-14 items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-9 items-center gap-1.5 truncate rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm">
                <WorkspaceIdentityMark workspaceName={rawWorkspaceName} isDefault={isDefaultWorkspace} />
                {workspaceName}
                {isDefaultLabel && activeWorkspaceBranch ? (
                  <span className="rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-muted-foreground">
                    {activeWorkspaceBranch}
                  </span>
                ) : null}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {workspaceName}{isDefaultLabel && activeWorkspaceBranch ? <span className="ml-1 rounded border border-border/60 bg-muted/60 px-1 py-px text-[10px] font-medium leading-tight">{activeWorkspaceBranch}</span> : null}
            </TooltipContent>
          </Tooltip>
          {isDefaultWorkspace ? (
            <DropdownMenu open={branchOpen} onOpenChange={setBranchOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-md border border-border/80 bg-card/90 px-3 text-sm text-foreground transition-colors hover:bg-secondary/60",
                        branchOpen && "border-primary/70 bg-secondary/80",
                      )}
                    >
                      <GitBranch className="size-3.5" />
                      {currentBranch}
                      <ChevronDown className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Switch branch</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="start" sideOffset={8} className="h-[50vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto p-2">
                <Input
                  className="h-9 rounded-md text-sm"
                  placeholder="Search branches"
                  value={branchFilter}
                  onChange={(event) => setBranchFilter(event.target.value)}
                />
                <div className="mt-2 flex gap-2">
                  <Input
                    className="h-9 rounded-md text-sm"
                    placeholder="new-branch-name"
                    value={newBranchName}
                    onChange={(event) => setNewBranchName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleCreateBranch();
                      }
                    }}
                  />
                  <Button className="h-9 rounded-md px-3.5 text-sm" disabled={isBusy} onClick={() => void handleCreateBranch()}>
                    Create
                  </Button>
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  {branchError ? <p className="break-words px-2 py-1 whitespace-pre-wrap text-destructive">{branchError}</p> : null}
                  {filteredBranches.map((branch) => {
                    const isCurrent = branch === currentBranch;
                    const statusLabel = isCurrent
                      ? "Current branch"
                      : "Checkout";

                    return (
                      <button
                        key={branch}
                        type="button"
                        className={cn(
                          "w-full rounded-sm px-2 py-2 text-left transition-colors",
                          isCurrent && "border border-border bg-accent",
                          !isCurrent && "hover:bg-accent/60",
                          (isBusy || isCurrent) && "cursor-not-allowed opacity-60",
                        )}
                        onClick={() => {
                          void handleCheckoutBranch({ name: branch }).then((ok) => {
                            if (!ok) {
                              return;
                            }
                            setBranchOpen(false);
                            setBranchFilter("");
                          });
                        }}
                        disabled={isBusy || isCurrent}
                        title={statusLabel}
                      >
                        <p className="font-medium">{branch}</p>
                        <p className="text-sm text-muted-foreground">{statusLabel}</p>
                      </button>
                    );
                  })}
                  {!branchError && filteredBranches.length === 0 ? <p className="px-2 py-2 text-muted-foreground">No available branches.</p> : null}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : workspacePathById[activeWorkspaceId] ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="inline-flex h-9 max-w-[min(28rem,42vw)] items-center gap-1.5 truncate rounded-md border border-border/80 bg-card/90 px-3 text-sm text-foreground">
                  <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{workspacePathLabel}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[min(42rem,calc(100vw-2rem))]">
                <span className="break-all whitespace-normal">
                  {workspacePathById[activeWorkspaceId]}
                </span>
              </TooltipContent>
            </Tooltip>
          ) : null}
          {!isDefaultWorkspace ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/80 bg-card/90 px-3 text-sm text-foreground transition-colors hover:bg-secondary/60"
                  onClick={() => void handleOpenPR()}
                >
                  <GitPullRequest className="size-3.5" />
                  Open PR
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open pull request on GitHub</TooltipContent>
            </Tooltip>
          ) : null}
        </TooltipProvider>
      </div>
      <TooltipProvider>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={isEditorOpen ? "default" : "ghost"}
                className={cn(
                  "h-9 w-9 rounded-md border border-transparent p-0 transition-colors",
                  isEditorOpen
                    ? "ring-1 ring-primary/40"
                    : "hover:border-border/80 hover:bg-card/90"
                )}
                onClick={() => {
                  setLayout({ patch: { editorVisible: !isEditorOpen } });
                }}
                aria-label="Editor"
              >
                <FileCode2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Editor</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={sidebarOverlayVisible ? "default" : "ghost"}
                className={cn(
                  "h-9 w-9 rounded-md border border-transparent p-0 transition-colors",
                  sidebarOverlayVisible
                    ? "ring-1 ring-primary/40"
                    : "hover:border-border/80 hover:bg-card/90"
                )}
                onClick={() => {
                  const nextVisible = !sidebarOverlayVisible;
                  setLayout({ patch: { sidebarOverlayVisible: nextVisible } });
                  if (nextVisible) {
                    window.dispatchEvent(new CustomEvent("stave:right-panel-tab", { detail: "explorer" }));
                  }
                }}
                aria-label="Explorer"
              >
                <FolderTree className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Explorer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant={isTerminalOpen ? "default" : "ghost"}
                className={cn(
                  "h-9 w-9 rounded-md border border-transparent p-0 transition-colors",
                  isTerminalOpen
                    ? "ring-1 ring-primary/40"
                    : "hover:border-border/80 hover:bg-card/90"
                )}
                onClick={() => setLayout({ patch: { terminalDocked: !isTerminalOpen } })}
                aria-label="Terminal"
              >
                <TerminalSquare className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Terminal</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}

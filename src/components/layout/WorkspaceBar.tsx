import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileCode2, FolderTree, GitBranch, GitPullRequest, TerminalSquare } from "lucide-react";
import { Button, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import { WorkspaceIdentityMark } from "@/components/layout/workspace-accent";

export function WorkspaceBar() {
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchFilter, setBranchFilter] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState("main");
  const [branchError, setBranchError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const branchMenuRef = useRef<HTMLDivElement | null>(null);
  const layout = useAppStore((state) => state.layout);
  const setLayout = useAppStore((state) => state.setLayout);
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspaceDefaultById = useAppStore((state) => state.workspaceDefaultById);
  const workspaceBranchById = useAppStore((state) => state.workspaceBranchById);
  const workspacePathById = useAppStore((state) => state.workspacePathById);
  const setWorkspaceBranch = useAppStore((state) => state.setWorkspaceBranch);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const rawWorkspaceName = activeWorkspace?.name ?? "Default Workspace";
  const workspaceName = rawWorkspaceName.toLowerCase() === "default workspace" ? "Default" : rawWorkspaceName;
  const isDefaultWorkspace = Boolean(workspaceDefaultById[activeWorkspaceId]);

  const workspaceCwd = workspacePathById[activeWorkspaceId];
  const isTerminalOpen = layout.terminalDocked;
  const isEditorOpen = layout.editorVisible;

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
    const next = workspaceBranchById[activeWorkspaceId];
    if (next) {
      setCurrentBranch(next);
    }
  }, [workspaceBranchById, activeWorkspaceId]);

  useEffect(() => {
    if (!branchOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (branchMenuRef.current?.contains(event.target as Node)) {
        return;
      }
      setBranchOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [branchOpen]);

  const filteredBranches = useMemo(() => {
    const normalized = branchFilter.trim().toLowerCase();
    if (!normalized) {
      return branches;
    }
    return branches.filter((branch) => branch.toLowerCase().includes(normalized));
  }, [branchFilter, branches]);

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
      return;
    }
    const remoteResult = await runCommand({ command: "git remote get-url origin", cwd: workspaceCwd });
    if (!remoteResult?.ok) {
      return;
    }
    const remoteUrl = remoteResult.stdout.trim();
    let ownerRepo: string | null = null;
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+\/.+?)(?:\.git)?$/);
    const httpsMatch = remoteUrl.match(/https:\/\/github\.com\/([^/]+\/.+?)(?:\.git)?$/);
    if (sshMatch) {
      ownerRepo = sshMatch[1] ?? null;
    } else if (httpsMatch) {
      ownerRepo = httpsMatch[1] ?? null;
    }
    if (!ownerRepo) {
      return;
    }
    const branch = workspaceBranchById[activeWorkspaceId] ?? currentBranch;
    const openExternal = window.api?.shell?.openExternal;
    if (!openExternal) {
      return;
    }
    await openExternal({ url: `https://github.com/${ownerRepo}/compare/${branch}?expand=1` });
  }

  async function handleCheckoutBranch(args: { name: string }) {
    const checkoutBranch = window.api?.sourceControl?.checkoutBranch;
    if (!checkoutBranch) {
      setBranchError("Checkout bridge unavailable.");
      return;
    }

    setIsBusy(true);
    const result = await checkoutBranch({ name: args.name, cwd: workspaceCwd });
    if (!result.ok) {
      setBranchError(result.stderr || "Branch checkout failed.");
      setIsBusy(false);
      return;
    }
    setWorkspaceBranch({ workspaceId: activeWorkspaceId, branch: args.name });
    setCurrentBranch(args.name);
    await loadBranches();
    setIsBusy(false);
  }

  return (
    <div data-testid="workspace-bar" className="relative z-20 flex h-14 items-center justify-between px-3 py-2.5 text-sm sm:px-4">
      <div className="flex items-center gap-2 overflow-hidden">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-9 items-center gap-1.5 truncate rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm">
                <WorkspaceIdentityMark workspaceName={rawWorkspaceName} />
                {workspaceName}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{workspaceName}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md border border-border/80 bg-card/90 px-3 text-sm text-foreground transition-colors hover:bg-secondary/60 disabled:cursor-not-allowed disabled:opacity-50",
                  branchOpen && "border-primary/70 bg-secondary/80",
                )}
                onClick={() => setBranchOpen((prev) => !prev)}
                disabled={!isDefaultWorkspace}
              >
                <GitBranch className="size-3.5" />
                {currentBranch}
                <ChevronDown className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isDefaultWorkspace ? "Switch branch" : "Branch switch disabled for worktree workspace"}
            </TooltipContent>
          </Tooltip>
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
        <div className="flex items-center gap-1 overflow-x-auto">
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
                  setLayout({ patch: { editorVisible: !layout.editorVisible } });
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
                variant={layout.sidebarOverlayVisible ? "default" : "ghost"}
                className={cn(
                  "h-9 w-9 rounded-md border border-transparent p-0 transition-colors",
                  layout.sidebarOverlayVisible
                    ? "ring-1 ring-primary/40"
                    : "hover:border-border/80 hover:bg-card/90"
                )}
                onClick={() => {
                  const nextVisible = !layout.sidebarOverlayVisible;
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
                onClick={() => setLayout({ patch: { terminalDocked: !layout.terminalDocked } })}
                aria-label="Terminal"
              >
                <TerminalSquare className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Terminal</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      {branchOpen && isDefaultWorkspace ? (
        <div ref={branchMenuRef} className="overflow-y-auto animate-dropdown-in absolute left-28 top-12 z-40 w-[min(26rem,calc(100vw-2rem))] h-[50vh] rounded-md border border-border/80 bg-card p-2 shadow-xl">
          <Input
            className="h-9 rounded-md border-border/80 bg-background text-sm"
            placeholder="Search branches"
            value={branchFilter}
            onChange={(event) => setBranchFilter(event.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <Input
              className="h-9 rounded-md border-border/80 bg-background text-sm"
              placeholder="new-branch-name"
              value={newBranchName}
              onChange={(event) => setNewBranchName(event.target.value)}
            />
            <Button className="h-9 rounded-md px-3.5 text-sm" disabled={isBusy} onClick={() => void handleCreateBranch()}>
              Create
            </Button>
          </div>
          <div className="mt-2 space-y-1 text-sm">
            {branchError ? <p className="px-2 py-1 text-destructive">{branchError}</p> : null}
            {filteredBranches.map((branch) => (
              <button
                key={branch}
                className={[
                  "w-full rounded-sm px-2 py-2 text-left hover:bg-secondary/60",
                  branch === currentBranch ? "border border-border/70 bg-secondary/60" : "",
                ].join(" ")}
                onClick={() => void handleCheckoutBranch({ name: branch })}
                disabled={isBusy}
              >
                <p className="font-medium">{branch}</p>
                <p className="text-sm text-muted-foreground">{branch === currentBranch ? "Current branch" : "Checkout"}</p>
              </button>
            ))}
            {!branchError && filteredBranches.length === 0 ? <p className="px-2 py-2 text-muted-foreground">No branches.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

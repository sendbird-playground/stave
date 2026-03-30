import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GitPullRequest,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
} from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { generateFallbackPullRequestDraft } from "@/lib/source-control-pr";
import { PrStatusIcon } from "@/components/layout/PrStatusIcon";
import { useAppStore } from "@/store/app.store";
import {
  type WorkspacePrStatus,
  PR_STATUS_VISUAL,
  PR_STATUS_ACTIONS,
  PR_COLOR_BADGE_CLASS,
} from "@/lib/pr-status";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScmStatusItem {
  path: string;
  code: string;
}

type Step =
  | "idle"
  | "loading"       // checking status + generating PR description
  | "ready"         // dialog open with all fields populated
  | "committing"    // committing uncommitted changes
  | "pushing"       // pushing to remote
  | "creating-pr"   // running gh pr create
  | "action";       // running a PR action (mark ready, merge, etc.)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TopBarOpenPR(props: { noDragStyle: CSSProperties }) {
  const [step, setStep] = useState<Step>("idle");
  const [dialogOpen, setDialogOpen] = useState(false);

  // PR fields
  const [prTitle, setPrTitle] = useState("");
  const [prBody, setPrBody] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Uncommitted changes section
  const [changedFiles, setChangedFiles] = useState<ScmStatusItem[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [changesExpanded, setChangesExpanded] = useState(true);
  const suggestionRequestIdRef = useRef(0);
  const prTitleEditedRef = useRef(false);
  const prBodyEditedRef = useRef(false);

  const [
    activeWorkspaceId,
    workspaceDefaultById,
    workspaceBranchById,
    workspacePathById,
    projectPath,
    defaultBranch,
    workspacePrInfoById,
    fetchWorkspacePrStatus,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.workspaceDefaultById,
    state.workspaceBranchById,
    state.workspacePathById,
    state.projectPath,
    state.defaultBranch,
    state.workspacePrInfoById,
    state.fetchWorkspacePrStatus,
  ] as const));

  const isDefaultWorkspace = Boolean(workspaceDefaultById[activeWorkspaceId]);
  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? "";
  const hasWorkspaceContext = Boolean(activeWorkspaceId && workspaceCwd);
  const currentBranch = workspaceBranchById[activeWorkspaceId];
  const baseBranch = defaultBranch.trim() || "main";

  const prInfo = workspacePrInfoById[activeWorkspaceId];
  const prStatus: WorkspacePrStatus = prInfo?.derived ?? "no_pr";
  const visual = PR_STATUS_VISUAL[prStatus];
  const actions = PR_STATUS_ACTIONS[prStatus];

  // -------------------------------------------------------------------------
  // Polling – fetch PR status for active workspace
  // -------------------------------------------------------------------------

  const fetchStatus = useCallback(() => {
    if (activeWorkspaceId && !isDefaultWorkspace) {
      void fetchWorkspacePrStatus({ workspaceId: activeWorkspaceId });
    }
  }, [activeWorkspaceId, isDefaultWorkspace, fetchWorkspacePrStatus]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // -------------------------------------------------------------------------
  // Hide on default workspace
  // -------------------------------------------------------------------------

  if (!hasWorkspaceContext || isDefaultWorkspace) return null;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function generateFallbackCommitMessage(files: ScmStatusItem[]) {
    const added = files.filter((f) => f.code === "?" || f.code === "A").length;
    const modified = files.filter((f) => f.code === "M").length;
    const deleted = files.filter((f) => f.code === "D").length;
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} added`);
    if (modified > 0) parts.push(`${modified} modified`);
    if (deleted > 0) parts.push(`${deleted} deleted`);
    return `chore: update ${parts.join(", ") || `${files.length} changes`}`;
  }

  function generateFallbackPRDraft(files: ScmStatusItem[]) {
    return generateFallbackPullRequestDraft({
      baseBranch,
      headBranch: currentBranch,
      fileList: files.map((file) => `${file.code} ${file.path}`).join("\n"),
    });
  }

  // -------------------------------------------------------------------------
  // PR Creation flow
  // -------------------------------------------------------------------------

  async function handleCreateClick() {
    const getStatus = window.api?.sourceControl?.getStatus;
    const suggestPRDescription = window.api?.provider?.suggestPRDescription;
    if (!getStatus) {
      toast.error("Unable to create PR", { description: "Source Control bridge unavailable." });
      return;
    }

    const requestId = suggestionRequestIdRef.current + 1;
    suggestionRequestIdRef.current = requestId;
    prTitleEditedRef.current = false;
    prBodyEditedRef.current = false;

    setStep("loading");
    setDialogOpen(true);
    setIsGenerating(true);
    setPrTitle("");
    setPrBody("");
    setCommitMessage("");
    setChangedFiles([]);
    setChangesExpanded(true);

    const statusPromise = getStatus({ cwd: workspaceCwd });
    const descPromise = suggestPRDescription
      ? suggestPRDescription({
        cwd: workspaceCwd,
        baseBranch,
      }).catch(() => undefined)
      : undefined;

    const status = await statusPromise;
    if (suggestionRequestIdRef.current !== requestId) {
      return;
    }

    if (!status.ok) {
      toast.error("Unable to check status", { description: status.stderr || "git status failed." });
      setStep("idle");
      setDialogOpen(false);
      setIsGenerating(false);
      return;
    }

    setChangedFiles(status.items);
    const fallbackDraft = generateFallbackPRDraft(status.items);
    setPrTitle(fallbackDraft.title);
    setPrBody(fallbackDraft.body);
    setStep("ready");

    const descResult = await (descPromise ?? Promise.resolve(undefined));
    if (suggestionRequestIdRef.current !== requestId) {
      return;
    }

    if (descResult?.ok) {
      if (!prTitleEditedRef.current && descResult.title?.trim()) {
        setPrTitle(descResult.title.trim());
      }
      if (!prBodyEditedRef.current && descResult.body?.trim()) {
        setPrBody(descResult.body.trim());
      }
    }

    setIsGenerating(false);
  }

  async function handleSubmit(options: { draft: boolean }) {
    const runCommand = window.api?.terminal?.runCommand;
    const createPR = window.api?.sourceControl?.createPR;
    const openExternal = window.api?.shell?.openExternal;

    if (!runCommand || !createPR) {
      toast.error("Unable to create PR", { description: "Bridge unavailable." });
      setStep("ready");
      return;
    }

    const title = prTitle.trim() || generateFallbackPRDraft(changedFiles).title;

    // Step 1: Commit uncommitted changes if any
    if (changedFiles.length > 0) {
      const stageAll = window.api?.sourceControl?.stageAll;
      const commit = window.api?.sourceControl?.commit;
      if (!stageAll || !commit) {
        toast.error("Commit failed", { description: "Source Control bridge unavailable." });
        setStep("ready");
        return;
      }

      setStep("committing");

      let message = commitMessage.trim();
      if (!message) {
        const suggestCommitMessage = window.api?.provider?.suggestCommitMessage;
        if (suggestCommitMessage) {
          try {
            const result = await suggestCommitMessage({ cwd: workspaceCwd });
            if (result.ok && result.message) {
              message = result.message;
            }
          } catch {
            // fall through
          }
        }
        if (!message) {
          message = generateFallbackCommitMessage(changedFiles);
        }
      }

      const stageResult = await stageAll({ cwd: workspaceCwd });
      if (!stageResult.ok) {
        toast.error("Stage failed", { description: stageResult.stderr || "git add failed." });
        setStep("ready");
        return;
      }

      const commitResult = await commit({ message, cwd: workspaceCwd });
      if (!commitResult.ok) {
        toast.error("Commit failed", { description: commitResult.stderr || "git commit failed." });
        setStep("ready");
        return;
      }

      toast.success("Committed", { description: message });
    }

    // Step 2: Push
    setStep("pushing");
    const pushResult = await runCommand({ command: "git push -u origin HEAD", cwd: workspaceCwd });
    if (!pushResult.ok) {
      toast.error("Push failed", { description: pushResult.stderr || "git push failed." });
      setStep("ready");
      return;
    }

    // Step 3: Create PR
    setStep("creating-pr");
    const prResult = await createPR({
      title,
      body: prBody.trim() || undefined,
      baseBranch,
      draft: options.draft,
      cwd: workspaceCwd,
    });

    if (!prResult.ok) {
      toast.error("PR creation failed", { description: prResult.stderr || "gh pr create failed." });
      setStep("ready");
      return;
    }

    // Success – close dialog, refresh status
    setDialogOpen(false);
    setStep("idle");

    const label = options.draft ? "Draft PR created" : "PR created";
    toast.success(label, { description: prResult.prUrl ?? "Pull request created successfully." });

    // Refresh PR status to pick up the new PR
    fetchStatus();

    if (prResult.prUrl && openExternal) {
      try {
        await openExternal({ url: prResult.prUrl });
      } catch {
        // non-critical
      }
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== "ready") return;
    void handleSubmit({ draft: false });
  }

  // -------------------------------------------------------------------------
  // PR Action handlers
  // -------------------------------------------------------------------------

  async function handleMarkReady() {
    const setPrReady = window.api?.sourceControl?.setPrReady;
    if (!setPrReady) { toast.error("Bridge unavailable"); return; }

    setStep("action");
    const result = await setPrReady({ cwd: workspaceCwd });
    setStep("idle");

    if (!result.ok) {
      toast.error("Failed to mark PR as ready", { description: result.stderr });
      return;
    }
    toast.success("PR marked as ready for review");
    fetchStatus();
  }

  async function handleMerge() {
    const mergePr = window.api?.sourceControl?.mergePr;
    if (!mergePr) { toast.error("Bridge unavailable"); return; }

    setStep("action");
    const result = await mergePr({ method: "squash", cwd: workspaceCwd });
    setStep("idle");

    if (!result.ok) {
      toast.error("Merge failed", { description: result.stderr });
      return;
    }
    toast.success("PR merged successfully");
    fetchStatus();
  }

  async function handleUpdateBranch() {
    const updatePrBranch = window.api?.sourceControl?.updatePrBranch;
    if (!updatePrBranch) { toast.error("Bridge unavailable"); return; }

    setStep("action");
    const result = await updatePrBranch({ cwd: workspaceCwd });
    setStep("idle");

    if (!result.ok) {
      toast.error("Branch update failed", { description: result.stderr });
      return;
    }
    toast.success("Branch updated");
    fetchStatus();
  }

  function handleOpenGitHub() {
    const url = prInfo?.pr?.url;
    if (url) {
      void window.api?.shell?.openExternal?.({ url });
    }
  }

  function handleAction(key: string) {
    switch (key) {
      case "create_pr":     void handleCreateClick(); break;
      case "create_draft":  void handleCreateClick(); break;
      case "mark_ready":    void handleMarkReady(); break;
      case "merge":         void handleMerge(); break;
      case "update_branch": void handleUpdateBranch(); break;
      case "open_github":   handleOpenGitHub(); break;
      case "refresh":       fetchStatus(); break;
    }
  }

  // -------------------------------------------------------------------------
  // Derived UI state
  // -------------------------------------------------------------------------

  const isBusy = step !== "idle" && step !== "ready";
  const isDialogBusy = step === "committing" || step === "pushing" || step === "creating-pr";
  const statusLabel =
    step === "loading" ? "Loading..." :
    step === "committing" ? "Committing..." :
    step === "pushing" ? "Pushing..." :
    step === "creating-pr" ? "Creating..." :
    step === "action" ? "Working..." :
    null;

  const badgeColorClass = PR_COLOR_BADGE_CLASS[visual.color];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* --- Trigger button: "Create PR" or PR status dropdown --- */}
      {prStatus === "no_pr" ? (
        /* No PR – show "Create PR" button */
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
              style={props.noDragStyle}
              onClick={() => void handleCreateClick()}
              disabled={isBusy}
            >
              {isBusy ? (
                <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <GitPullRequest className="size-3.5 shrink-0" />
              )}
              {statusLabel ?? "Create PR"}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Create a pull request on GitHub</TooltipContent>
        </Tooltip>
      ) : (
        /* Has PR – show status dropdown */
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                    badgeColorClass,
                  )}
                  style={props.noDragStyle}
                  disabled={isBusy}
                >
                  {isBusy ? (
                    <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
                  ) : (
                    <PrStatusIcon status={prStatus} className="size-3.5" />
                  )}
                  {statusLabel ?? visual.label}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              PR #{prInfo?.pr?.number}: {visual.label}
            </TooltipContent>
          </Tooltip>

          <DropdownMenuContent align="end" className="w-64">
            {/* PR info header */}
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="truncate text-xs font-medium">
                #{prInfo?.pr?.number} {prInfo?.pr?.title}
              </span>
              <span className="text-[10px] font-normal text-muted-foreground">
                {currentBranch} &rarr; {prInfo?.pr?.baseRefName ?? baseBranch}
              </span>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            {/* Primary action */}
            {actions.primary ? (
              <DropdownMenuItem
                className="font-medium"
                onSelect={() => handleAction(actions.primary!.key)}
              >
                {actions.primary.label}
              </DropdownMenuItem>
            ) : null}

            {/* Secondary actions */}
            {actions.secondary.map((action) => (
              <DropdownMenuItem
                key={action.key}
                onSelect={() => handleAction(action.key)}
              >
                {action.key === "open_github" || action.key === "refresh" ? (
                  <span className="flex items-center gap-2">
                    {action.key === "open_github" ? (
                      <ExternalLink className="size-3.5 text-muted-foreground" />
                    ) : (
                      <RefreshCw className="size-3.5 text-muted-foreground" />
                    )}
                    {action.label}
                  </span>
                ) : (
                  action.label
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* --- PR Creation Dialog --- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!isDialogBusy) {
            setDialogOpen(open);
          }
          if (!open) {
            suggestionRequestIdRef.current += 1;
            setIsGenerating(false);
            setStep("idle");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Pull Request</DialogTitle>
            <DialogDescription className="space-y-1">
              <span className="block">
                {currentBranch ?? "HEAD"} &rarr; {baseBranch}
              </span>
              {isGenerating ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Refreshing the suggested title and description...
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleFormSubmit}>
            {/* PR Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="pr-title-input">
                Title
              </label>
              <Input
                autoFocus
                id="pr-title-input"
                className="h-9 text-sm"
                placeholder="PR title"
                value={prTitle}
                onChange={(e) => {
                  prTitleEditedRef.current = true;
                  setPrTitle(e.target.value);
                }}
                disabled={isDialogBusy || step === "loading"}
              />
            </div>

            {/* PR Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="pr-body-input">
                Description
              </label>
              <Textarea
                id="pr-body-input"
                className="min-h-24 resize-y text-sm"
                rows={6}
                placeholder="Describe your changes..."
                value={prBody}
                onChange={(e) => {
                  prBodyEditedRef.current = true;
                  setPrBody(e.target.value);
                }}
                disabled={isDialogBusy || step === "loading"}
              />
            </div>

            {/* Uncommitted Changes */}
            {changedFiles.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 text-sm font-medium text-amber-500"
                  onClick={() => setChangesExpanded((v) => !v)}
                >
                  {changesExpanded ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                  {changedFiles.length} uncommitted file{changedFiles.length !== 1 ? "s" : ""}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (will be committed before creating PR)
                  </span>
                </button>

                {changesExpanded && (
                  <>
                    <div className="max-h-32 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
                      {changedFiles.map((file) => (
                        <div key={file.path} className="flex items-center gap-2 py-0.5">
                          <span className="w-5 shrink-0 text-center font-mono font-medium text-muted-foreground">{file.code}</span>
                          <span className="truncate font-mono">{file.path}</span>
                        </div>
                      ))}
                    </div>

                    <Input
                      id="commit-message-input"
                      className="h-9 text-sm"
                      placeholder={generateFallbackCommitMessage(changedFiles)}
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      disabled={isDialogBusy}
                    />
                  </>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={step !== "ready" || isDialogBusy}
                onClick={() => void handleSubmit({ draft: true })}
              >
                {step === "creating-pr" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Create Draft
              </Button>
              <Button
                type="submit"
                disabled={step !== "ready" || isDialogBusy}
              >
                {isDialogBusy && step !== "creating-pr" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Create PR
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

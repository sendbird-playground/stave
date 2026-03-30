import { useState, type CSSProperties, type FormEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { ChevronDown, ChevronRight, GitPullRequest, LoaderCircle } from "lucide-react";
import {
  Button,
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
import { useAppStore } from "@/store/app.store";

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
  | "creating-pr";  // running gh pr create

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

  const [
    activeWorkspaceId,
    workspaceDefaultById,
    workspaceBranchById,
    workspacePathById,
    projectPath,
    defaultBranch,
  ] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.workspaceDefaultById,
    state.workspaceBranchById,
    state.workspacePathById,
    state.projectPath,
    state.defaultBranch,
  ] as const));

  const isDefaultWorkspace = Boolean(workspaceDefaultById[activeWorkspaceId]);
  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? "";
  const hasWorkspaceContext = Boolean(activeWorkspaceId && workspaceCwd);
  const currentBranch = workspaceBranchById[activeWorkspaceId];
  const baseBranch = defaultBranch.trim() || "main";

  if (!hasWorkspaceContext || isDefaultWorkspace) return null;

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

  function generateFallbackPRTitle() {
    const branch = currentBranch ?? "HEAD";
    // Try to derive a readable title from the branch name
    const cleaned = branch
      .replace(/^(feat|fix|chore|refactor|docs|test|ci|build|perf|style)[/\\-]/, "$1: ")
      .replaceAll(/[/_-]+/g, " ")
      .trim();
    return cleaned || `PR from ${branch}`;
  }

  async function handleClick() {
    const getStatus = window.api?.sourceControl?.getStatus;
    if (!getStatus) {
      toast.error("Unable to create PR", { description: "Source Control bridge unavailable." });
      return;
    }

    // Open dialog immediately in loading state
    setStep("loading");
    setDialogOpen(true);
    setIsGenerating(true);
    setPrTitle("");
    setPrBody("");
    setCommitMessage("");
    setChangedFiles([]);
    setChangesExpanded(true);

    // Run status check and PR description generation in parallel
    const statusPromise = getStatus({ cwd: workspaceCwd });
    const descPromise = window.api?.provider?.suggestPRDescription?.({
      cwd: workspaceCwd,
      baseBranch,
    });

    const [status, descResult] = await Promise.all([
      statusPromise,
      descPromise ?? Promise.resolve(undefined),
    ]);

    if (!status.ok) {
      toast.error("Unable to check status", { description: status.stderr || "git status failed." });
      setStep("idle");
      setDialogOpen(false);
      setIsGenerating(false);
      return;
    }

    // Populate state
    setChangedFiles(status.items);

    if (descResult?.ok && descResult.title) {
      setPrTitle(descResult.title);
      setPrBody(descResult.body ?? "");
    } else {
      setPrTitle(generateFallbackPRTitle());
      setPrBody("");
    }

    setIsGenerating(false);
    setStep("ready");
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

    const title = prTitle.trim() || generateFallbackPRTitle();

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
        // Try AI-generated commit message, fall back to generated message
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

    // Success
    setDialogOpen(false);
    setStep("idle");

    const label = options.draft ? "Draft PR created" : "PR created";
    toast.success(label, { description: prResult.prUrl ?? "Pull request created successfully." });

    // Open in browser
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

  const isBusy = step !== "idle" && step !== "ready";
  const isDialogBusy = step === "committing" || step === "pushing" || step === "creating-pr";
  const statusLabel =
    step === "loading" ? "Loading..." :
    step === "committing" ? "Committing..." :
    step === "pushing" ? "Pushing..." :
    step === "creating-pr" ? "Creating..." :
    null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            style={props.noDragStyle}
            onClick={() => void handleClick()}
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

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!isDialogBusy) setDialogOpen(open); if (!open) setStep("idle"); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Pull Request</DialogTitle>
            <DialogDescription>
              {currentBranch ?? "HEAD"} &rarr; {baseBranch}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleFormSubmit}>
            {/* PR Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="pr-title-input">
                Title
              </label>
              {isGenerating ? (
                <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Generating...
                </div>
              ) : (
                <Input
                  autoFocus
                  id="pr-title-input"
                  className="h-9 text-sm"
                  placeholder="PR title"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  disabled={isDialogBusy}
                />
              )}
            </div>

            {/* PR Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="pr-body-input">
                Description
              </label>
              {isGenerating ? (
                <div className="flex h-24 items-center justify-center rounded-md border border-border bg-muted/30 text-sm text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin" />
                </div>
              ) : (
                <Textarea
                  id="pr-body-input"
                  className="min-h-24 resize-y text-sm"
                  rows={6}
                  placeholder="Describe your changes..."
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  disabled={isDialogBusy}
                />
              )}
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
                disabled={isDialogBusy || isGenerating}
                onClick={() => void handleSubmit({ draft: true })}
              >
                {step === "creating-pr" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Create Draft
              </Button>
              <Button
                type="submit"
                disabled={isDialogBusy || isGenerating}
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

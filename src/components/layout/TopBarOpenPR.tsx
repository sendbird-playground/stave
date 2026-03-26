import { useState, type CSSProperties, type FormEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { GitPullRequest, LoaderCircle } from "lucide-react";
import {
  Button,
  Input,
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

function parseGitHubOwnerRepo(remoteUrl: string) {
  const normalized = remoteUrl.trim().replace(/\.git$/i, "");
  const sshMatch = normalized.match(/^(?:git@|ssh:\/\/git@)github\.com[:/]([^/]+\/[^/]+)$/i);
  if (sshMatch?.[1]) return sshMatch[1];
  const httpsMatch = normalized.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  if (httpsMatch?.[1]) return httpsMatch[1];
  return null;
}

interface ScmStatusItem {
  path: string;
  code: string;
}

type Step = "idle" | "checking" | "confirm" | "generating" | "committing" | "pushing" | "opening";

export function TopBarOpenPR(props: { noDragStyle: CSSProperties }) {
  const [step, setStep] = useState<Step>("idle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [changedFiles, setChangedFiles] = useState<ScmStatusItem[]>([]);

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
  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;
  const currentBranch = workspaceBranchById[activeWorkspaceId];

  if (isDefaultWorkspace) return null;

  async function resolveOwnerRepo(): Promise<string | null> {
    const runCommand = window.api?.terminal?.runCommand;
    if (!runCommand) return null;

    const lookupCwds = [workspaceCwd, projectPath].filter(
      (value, index, array): value is string => Boolean(value) && array.indexOf(value) === index,
    );

    for (const cwd of lookupCwds) {
      for (const remote of ["origin", "upstream"]) {
        const result = await runCommand({ command: `git remote get-url ${remote}`, cwd });
        if (!result?.ok) continue;
        const ownerRepo = parseGitHubOwnerRepo(result.stdout);
        if (ownerRepo) return ownerRepo;
      }
    }
    return null;
  }

  async function pushAndOpenPR() {
    const runCommand = window.api?.terminal?.runCommand;
    const openExternal = window.api?.shell?.openExternal;
    if (!runCommand || !openExternal) {
      toast.error("Unable to open PR", { description: "Bridge unavailable." });
      setStep("idle");
      return;
    }

    // Push
    setStep("pushing");
    const pushResult = await runCommand({ command: "git push -u origin HEAD", cwd: workspaceCwd });
    if (!pushResult.ok) {
      toast.error("Push failed", { description: pushResult.stderr || "git push failed." });
      setStep("idle");
      return;
    }

    // Open PR
    setStep("opening");
    const ownerRepo = await resolveOwnerRepo();
    if (!ownerRepo) {
      toast.error("Unable to open PR", { description: "GitHub remote not found." });
      setStep("idle");
      return;
    }

    const branch = currentBranch ?? "HEAD";
    const baseBranch = defaultBranch.trim() || "main";
    const comparePath = `${encodeURIComponent(baseBranch)}...${encodeURIComponent(branch)}`;

    try {
      const result = await openExternal({ url: `https://github.com/${ownerRepo}/compare/${comparePath}?expand=1` });
      if (!result.ok) {
        toast.error("Unable to open PR", { description: result.stderr || "Failed to open GitHub." });
      } else {
        toast.success("Opened in browser", { description: "GitHub compare page opened." });
      }
    } catch {
      toast.error("Unable to open PR", { description: "Failed to open GitHub." });
    }
    setStep("idle");
  }

  async function handleClick() {
    const getStatus = window.api?.sourceControl?.getStatus;
    if (!getStatus) {
      toast.error("Unable to open PR", { description: "Source Control bridge unavailable." });
      return;
    }

    setStep("checking");
    const status = await getStatus({ cwd: workspaceCwd });
    if (!status.ok) {
      toast.error("Unable to check status", { description: status.stderr || "git status failed." });
      setStep("idle");
      return;
    }

    if (status.items.length === 0) {
      // No uncommitted changes — push & open PR directly
      await pushAndOpenPR();
      return;
    }

    // Has uncommitted changes — show dialog
    setChangedFiles(status.items);
    setCommitMessage("");
    setStep("confirm");
    setDialogOpen(true);
  }

  function generateFallbackMessage() {
    const added = changedFiles.filter((f) => f.code === "?" || f.code === "A").length;
    const modified = changedFiles.filter((f) => f.code === "M").length;
    const deleted = changedFiles.filter((f) => f.code === "D").length;
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} added`);
    if (modified > 0) parts.push(`${modified} modified`);
    if (deleted > 0) parts.push(`${deleted} deleted`);
    return `chore: update ${parts.join(", ") || `${changedFiles.length} changes`}`;
  }

  async function handleAutoCommitAndPush() {
    const suggestCommitMessage = window.api?.provider?.suggestCommitMessage;

    setStep("generating");

    let message = generateFallbackMessage();

    if (suggestCommitMessage) {
      try {
        const result = await suggestCommitMessage({ cwd: workspaceCwd });
        if (result.ok && result.message) {
          message = result.message;
        }
      } catch {
        // fall through to use fallback message
      }
    }

    await handleCommitAndPush(message);
  }

  async function handleCommitAndPush(message: string) {
    const stageAll = window.api?.sourceControl?.stageAll;
    const commit = window.api?.sourceControl?.commit;
    if (!stageAll || !commit) {
      toast.error("Commit failed", { description: "Source Control bridge unavailable." });
      setStep("idle");
      setDialogOpen(false);
      return;
    }

    setStep("committing");

    const stageResult = await stageAll({ cwd: workspaceCwd });
    if (!stageResult.ok) {
      toast.error("Stage failed", { description: stageResult.stderr || "git add failed." });
      setStep("idle");
      setDialogOpen(false);
      return;
    }

    const commitResult = await commit({ message, cwd: workspaceCwd });
    if (!commitResult.ok) {
      toast.error("Commit failed", { description: commitResult.stderr || "git commit failed." });
      setStep("idle");
      setDialogOpen(false);
      return;
    }

    setDialogOpen(false);
    toast.success("Committed", { description: message });
    await pushAndOpenPR();
  }

  function handleConfirmSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "committing" || step === "generating") {
      return;
    }
    void handleCommitAndPush(commitMessage.trim() || generateFallbackMessage());
  }

  const isBusy = step !== "idle" && step !== "confirm";
  const statusLabel =
    step === "checking" ? "Checking..." :
    step === "generating" ? "Generating..." :
    step === "committing" ? "Committing..." :
    step === "pushing" ? "Pushing..." :
    step === "opening" ? "Opening..." :
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
            {statusLabel ?? "Open PR"}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Push and open pull request on GitHub</TooltipContent>
      </Tooltip>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!isBusy) setDialogOpen(open); if (!open) setStep("idle"); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Uncommitted Changes</DialogTitle>
            <DialogDescription>
              {changedFiles.length} file{changedFiles.length !== 1 ? "s" : ""} with uncommitted changes.
              Commit before opening a PR.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleConfirmSubmit}>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs">
              {changedFiles.map((file) => (
                <div key={file.path} className="flex items-center gap-2 py-0.5">
                  <span className="w-5 shrink-0 text-center font-mono font-medium text-muted-foreground">{file.code}</span>
                  <span className="truncate font-mono">{file.path}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="commit-message-input">
                Commit message
              </label>
              <Input
                autoFocus
                id="commit-message-input"
                className="h-9 text-sm"
                placeholder={generateFallbackMessage()}
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={step === "committing" || step === "generating"}
                onClick={() => void handleCommitAndPush(commitMessage.trim() || generateFallbackMessage())}
              >
                {step === "committing" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Commit &amp; push
              </Button>
              <Button
                type="button"
                disabled={step === "committing" || step === "generating"}
                onClick={() => void handleAutoCommitAndPush()}
              >
                {step === "generating" || step === "committing" ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Auto commit &amp; push
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

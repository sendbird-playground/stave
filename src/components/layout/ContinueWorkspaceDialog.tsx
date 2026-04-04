import { GitBranch, LoaderCircle } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Input } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildContinueWorkspaceBranchName } from "@/store/project.utils";

interface ContinueWorkspaceDialogProps {
  open: boolean;
  sourceBranch?: string;
  sourceWorkspaceName?: string;
  baseBranch: string;
  prTitle?: string;
  onOpenChange: (open: boolean) => void;
  onContinue: (args: { name: string }) => Promise<{ ok: boolean; message?: string; noticeLevel?: "success" | "warning" }>;
}

function buildSuggestedWorkspaceName(sourceBranch?: string) {
  return buildContinueWorkspaceBranchName({ sourceBranch });
}

export function ContinueWorkspaceDialog(props: ContinueWorkspaceDialogProps) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!props.open) {
      setError(null);
      setSubmitting(false);
      return;
    }
    setWorkspaceName(buildSuggestedWorkspaceName(props.sourceBranch));
    setError(null);
  }, [props.open, props.sourceBranch]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await props.onContinue({ name: workspaceName });
      if (!result.ok) {
        setError(result.message ?? "Failed to continue in a new workspace.");
        return;
      }
      props.onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to continue in a new workspace.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!submitting) {
          props.onOpenChange(open);
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Continue in New Workspace</DialogTitle>
            <DialogDescription>
              Create a fresh workspace from the base branch and attach a continuation brief from the completed branch to the first task draft.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Source Workspace</p>
                <div className="space-y-2">
                  <Badge variant="outline" className="max-w-full justify-start gap-1 rounded-md border-border/70 bg-background/80 px-2 font-normal">
                    <GitBranch className="size-3.5 text-muted-foreground" />
                    <span className="truncate">{props.sourceBranch ?? props.sourceWorkspaceName ?? "Current workspace"}</span>
                  </Badge>
                  {props.prTitle ? (
                    <p className="text-xs text-muted-foreground">{props.prTitle}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">New Workspace Base</p>
                <Badge variant="secondary" className="justify-start gap-1 rounded-md border border-border/60 bg-secondary/70 px-2 font-normal">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <span>{props.baseBranch}</span>
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Workspace Branch Name</p>
              <Input
                autoFocus
                value={workspaceName}
                placeholder="feature/follow-up--continue--20260404-164512"
                onChange={(event) => setWorkspaceName(event.target.value)}
                className="h-10 rounded-sm border-border/80 bg-background"
              />
              <p className="text-xs text-muted-foreground">
                Stave will create a markdown brief under `.stave/context/` and attach it to the first task draft.
              </p>
            </div>

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <LoaderCircle className="mr-2 size-4 animate-spin" />
                  Continuing...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { GitBranch, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button, Card, Input, Textarea, toast } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CreateWorkspaceDialogProps {
  open: boolean;
  activeBranch: string;
  cwd?: string;
  defaultInitCommand?: string;
  onOpenChange: (open: boolean) => void;
  onCreateWorkspace: (args: {
    name: string;
    mode: "branch" | "clean";
    fromBranch?: string;
    initCommand?: string;
  }) => Promise<{ ok: boolean; message?: string; noticeLevel?: "success" | "warning" }>;
}

export function CreateWorkspaceDialog({
  open,
  activeBranch,
  cwd,
  defaultInitCommand = "",
  onOpenChange,
  onCreateWorkspace,
}: CreateWorkspaceDialogProps) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creationMode, setCreationMode] = useState<"branch" | "clean">("branch");
  const [fromBranch, setFromBranch] = useState("main");
  const [initCommand, setInitCommand] = useState(defaultInitCommand);
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setFromBranch(activeBranch || "main");
    setInitCommand(defaultInitCommand);
    const listBranches = window.api?.sourceControl?.listBranches;
    if (!listBranches) {
      return;
    }
    void listBranches({ cwd }).then((result) => {
      if (result?.ok) {
        setAvailableBranches(result.branches);
      }
    });
  }, [activeBranch, cwd, open]);

  useEffect(() => {
    if (open) {
      return;
    }
    setWorkspaceName("");
    setCreateWorkspaceError(null);
    setCreatingWorkspace(false);
    setCreationMode("branch");
    setInitCommand(defaultInitCommand);
  }, [defaultInitCommand, open]);

  if (!open) {
    return null;
  }

  const submitModifierLabel =
    typeof navigator !== "undefined" && /(Mac|iPhone|iPad)/i.test(navigator.platform || navigator.userAgent)
      ? "Cmd+Enter"
      : "Ctrl+Enter";

  function closeDialog() {
    setCreateWorkspaceError(null);
    onOpenChange(false);
  }

  async function handleCreateWorkspace() {
    setCreatingWorkspace(true);
    setCreateWorkspaceError(null);
    try {
      const result = await onCreateWorkspace({
        name: workspaceName,
        mode: creationMode,
        fromBranch,
        initCommand,
      });
      if (!result.ok) {
        setCreateWorkspaceError(result.message ?? "Failed to create workspace.");
        return;
      }
      if (result.message) {
        if (result.noticeLevel === "warning") {
          toast.warning("Workspace created with warning", { description: result.message });
        } else {
          toast.success("Workspace created", { description: result.message });
        }
      }
      onOpenChange(false);
    } catch (error) {
      setCreateWorkspaceError(error instanceof Error ? error.message : "Failed to create workspace.");
    } finally {
      setCreatingWorkspace(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingWorkspace) {
      return;
    }
    void handleCreateWorkspace();
  }

  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !creatingWorkspace) {
      event.preventDefault();
      closeDialog();
      return;
    }

    if (
      event.key === "Enter"
      && (event.metaKey || event.ctrlKey)
      && (event.target as HTMLElement | null)?.closest("textarea")
      && !creatingWorkspace
    ) {
      event.preventDefault();
      void handleCreateWorkspace();
    }
  }

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]"
      onMouseDown={() => {
        if (creatingWorkspace) {
          return;
        }
        closeDialog();
      }}
    >
      <Card className="animate-dropdown-in w-full max-w-3xl rounded-lg border-border/80 bg-card p-6" onMouseDown={(event) => event.stopPropagation()}>
        <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-3xl font-semibold">New workspace</h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={creatingWorkspace}
              onClick={closeDialog}
            >
              <X className="size-4" />
            </Button>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Workspace is a dedicated git worktree bound to a branch.
          </p>
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium">Workspace Branch Name</p>
            <Input
              autoFocus
              value={workspaceName}
              placeholder="feature/your-workspace"
              onChange={(event) => setWorkspaceName(event.target.value)}
              className="h-10 rounded-sm border-border/80 bg-background"
            />
          </div>
          <p className="mb-2 text-sm font-medium">Creation Methods</p>
          <div className="space-y-2">
            <button
              type="button"
              className={cn(
                "w-full rounded-sm border p-3 text-left",
                creationMode === "branch" ? "border-primary bg-secondary/50" : "border-border/80 bg-card",
              )}
              onClick={() => setCreationMode("branch")}
            >
              <p className="flex items-center gap-2 text-base font-semibold">
                <GitBranch className="size-4" />
                Create From Branch
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Create worktree from the selected base branch.</p>
              <Select value={fromBranch} onValueChange={setFromBranch}>
                <SelectTrigger className="mt-2 h-8 text-sm" onClick={(event) => event.stopPropagation()}>
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {availableBranches.map((branch) => (
                    <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </button>
            <button
              type="button"
              className={cn(
                "w-full rounded-sm border p-3 text-left",
                creationMode === "clean" ? "border-primary bg-secondary/50" : "border-border/80 bg-card",
              )}
              onClick={() => setCreationMode("clean")}
            >
              <p className="text-base font-semibold">Create Clean Workspace</p>
              <p className="mt-1 text-sm text-muted-foreground">Create a new isolated worktree with a fresh branch.</p>
            </button>
          </div>
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Post-Create Command</p>
            <p className="mb-2 text-sm text-muted-foreground">
              Optional shell command to run once inside the new workspace root after creation. Useful for `bun install` or `npm install`.
            </p>
            <Textarea
              value={initCommand}
              placeholder="bun install"
              onChange={(event) => setInitCommand(event.target.value)}
              className="min-h-[110px] rounded-sm border-border/80 bg-background font-mono text-sm"
            />
            <p className="mt-2 text-xs text-muted-foreground">Shortcut: use {submitModifierLabel} to create while editing this field.</p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={creatingWorkspace}
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creatingWorkspace}>
              {creatingWorkspace ? "Creating..." : "Create"}
            </Button>
          </div>
          {createWorkspaceError ? (
            <p className="mt-3 text-sm text-destructive">{createWorkspaceError}</p>
          ) : null}
        </form>
      </Card>
    </div>
  );
}

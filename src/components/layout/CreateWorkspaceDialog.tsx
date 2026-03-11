import { GitBranch, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CreateWorkspaceDialogProps {
  open: boolean;
  activeBranch: string;
  cwd?: string;
  onOpenChange: (open: boolean) => void;
  onCreateWorkspace: (args: { name: string; mode: "branch" | "clean"; fromBranch?: string }) => Promise<{ ok: boolean; message?: string }>;
}

export function CreateWorkspaceDialog({
  open,
  activeBranch,
  cwd,
  onOpenChange,
  onCreateWorkspace,
}: CreateWorkspaceDialogProps) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [createWorkspaceError, setCreateWorkspaceError] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creationMode, setCreationMode] = useState<"branch" | "clean">("branch");
  const [fromBranch, setFromBranch] = useState("main");
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setFromBranch(activeBranch || "main");
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
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]"
      onMouseDown={() => {
        if (creatingWorkspace) {
          return;
        }
        setCreateWorkspaceError(null);
        onOpenChange(false);
      }}
    >
      <Card className="animate-dropdown-in w-full max-w-3xl rounded-lg border-border/80 bg-card p-6" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-3xl font-semibold">Create New Workspace</h3>
          <Button
            size="sm"
            variant="ghost"
            disabled={creatingWorkspace}
            onClick={() => {
              setCreateWorkspaceError(null);
              onOpenChange(false);
            }}
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
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={creatingWorkspace}
            onClick={() => {
              setCreateWorkspaceError(null);
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={creatingWorkspace}
            onClick={async () => {
              setCreatingWorkspace(true);
              setCreateWorkspaceError(null);
              try {
                const result = await onCreateWorkspace({ name: workspaceName, mode: creationMode, fromBranch });
                if (!result.ok) {
                  setCreateWorkspaceError(result.message ?? "Failed to create workspace.");
                  return;
                }
                onOpenChange(false);
              } catch (error) {
                setCreateWorkspaceError(error instanceof Error ? error.message : "Failed to create workspace.");
              } finally {
                setCreatingWorkspace(false);
              }
            }}
          >
            {creatingWorkspace ? "Creating..." : "Create Workspace"}
          </Button>
        </div>
        {createWorkspaceError ? (
          <p className="mt-3 text-sm text-destructive">{createWorkspaceError}</p>
        ) : null}
      </Card>
    </div>
  );
}

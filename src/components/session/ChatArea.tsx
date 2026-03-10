import { FolderOpen, Layers } from "lucide-react";
import { ChatInput } from "@/components/session/ChatInput";
import { ChatPanel } from "@/components/session/ChatPanel";
import { EmptySplash } from "@/components/session/EmptySplash";
import { PlanViewer } from "@/components/session/PlanViewer";
import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui";
import { useAppStore } from "@/store/app.store";

export function ChatArea() {
  const projectPath = useAppStore((state) => state.projectPath);
  const tasks = useAppStore((state) => state.tasks);
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const messagesByTask = useAppStore((state) => state.messagesByTask);
  const createProject = useAppStore((state) => state.createProject);
  const createTask = useAppStore((state) => state.createTask);
  const hasSelectedWorkspace = workspaces.some((workspace) => workspace.id === activeWorkspaceId);
  const hasAnyWorkspace = workspaces.length > 0;
  const hasSelectedTask = tasks.some((task) => task.id === activeTaskId);
  const isEmpty = (messagesByTask[activeTaskId] ?? []).length === 0;

  if (!projectPath) {
    return (
      <div data-testid="session-area" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm">
        <Empty data-testid="splash-no-project">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen strokeWidth={1.25} />
            </EmptyMedia>
            <EmptyTitle>Open a Project</EmptyTitle>
            <EmptyDescription>Select a local repository folder to get started.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => void createProject({})}>
              <FolderOpen className="size-4" />
              Select Folder
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (hasAnyWorkspace && !hasSelectedWorkspace) {
    return (
      <div data-testid="session-area" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm">
        <Empty data-testid="splash-no-workspace">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers strokeWidth={1.25} />
            </EmptyMedia>
            <EmptyTitle>Pick a Workspace</EmptyTitle>
            <EmptyDescription>Select a workspace from the bar above to continue.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  if (!hasSelectedTask) {
    return (
      <div data-testid="session-area" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm">
        <EmptySplash onCreateTask={() => createTask({ title: "" })} showCreateTaskAction />
      </div>
    );
  }

  const content = isEmpty
    ? (
        <section className="flex min-h-0 flex-1 items-center justify-center px-6">
          <div className="w-full max-w-xl">
            <ChatInput compact />
          </div>
        </section>
      )
    : (
        <>
          <ChatPanel />
          <div className="relative shrink-0">
            <PlanViewer />
            <ChatInput />
          </div>
        </>
      );

  return (
    <div data-testid="session-area" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm">
      {content}
    </div>
  );
}

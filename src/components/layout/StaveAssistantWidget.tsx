import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Bot, Settings2, Sparkles, Square, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Badge, Button, Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { STAVE_ASSISTANT_SESSION_ID } from "@/lib/stave-assistant";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { STAVE_ASSISTANT_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";

const TARGET_OPTIONS = [
  { value: "app", label: "App" },
  { value: "project", label: "Current Project" },
  { value: "workspace", label: "Current Workspace" },
] as const;

function UserMessageBubble(args: { content: string }) {
  return (
    <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-md border border-primary/20 bg-primary/10 px-3.5 py-2.5 text-sm text-foreground shadow-sm">
      <p className="whitespace-pre-wrap break-words leading-6">{args.content}</p>
    </div>
  );
}

function AssistantMessageCard(args: {
  message: Parameters<typeof AssistantMessageBody>[0]["message"] & {
    id: string;
    model: string;
    providerId: "claude-code" | "codex" | "stave" | "user";
  };
  streamingEnabled: boolean;
}) {
  return (
    <div className="max-w-full rounded-2xl rounded-bl-md border border-border/70 bg-card/80 px-3.5 py-3 shadow-sm supports-backdrop-filter:backdrop-blur-sm">
      <AssistantMessageBody
        message={args.message}
        taskId={STAVE_ASSISTANT_SESSION_ID}
        messageId={args.message.id}
        streamingEnabled={args.streamingEnabled}
      />
      {args.message.providerId !== "user" ? (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <ModelIcon providerId={args.message.providerId} className="size-3.5" />
          <span>{toHumanModelName({ model: args.message.model })}</span>
        </div>
      ) : null}
    </div>
  );
}

export function StaveAssistantWidget() {
  const [
    open,
    targetKind,
    messages,
    promptText,
    focusNonce,
    activeTurnId,
    assistantRouterModel,
    assistantChatModel,
    assistantPlannerModel,
    assistantAutoHandoffToTask,
    projectName,
    projectPath,
    activeWorkspaceName,
    setOpen,
    setTarget,
    clearConversation,
    updatePromptDraft,
    sendMessage,
    abortTurn,
  ] = useAppStore(useShallow((state) => [
    state.staveAssistant.open,
    state.staveAssistant.target.kind,
    state.staveAssistant.messages,
    state.staveAssistant.promptDraft.text,
    state.staveAssistant.focusNonce,
    state.staveAssistant.activeTurnId,
    state.settings.assistantRouterModel,
    state.settings.assistantChatModel,
    state.settings.assistantPlannerModel,
    state.settings.assistantAutoHandoffToTask,
    state.projectName,
    state.projectPath,
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.name ?? null,
    state.setStaveAssistantOpen,
    state.setStaveAssistantTarget,
    state.clearStaveAssistantConversation,
    state.updateStaveAssistantPromptDraft,
    state.sendStaveAssistantMessage,
    state.abortStaveAssistantTurn,
  ] as const));
  const [submitting, setSubmitting] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isTurnActive = Boolean(activeTurnId);
  const trimmedPrompt = promptText.trim();
  const currentTargetLabel = TARGET_OPTIONS.find((option) => option.value === targetKind)?.label ?? "Current Project";
  const modelSummary = useMemo(() => [
    `Chat: ${toHumanModelName({ model: assistantChatModel })}`,
    `Planner: ${toHumanModelName({ model: assistantPlannerModel })}`,
    `Router: ${toHumanModelName({ model: assistantRouterModel })}`,
  ].join(" · "), [assistantChatModel, assistantPlannerModel, assistantRouterModel]);

  useEffect(() => {
    if (!open) {
      return;
    }
    textareaRef.current?.focus();
  }, [focusNonce, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [messages, open]);

  const handleSubmit = async () => {
    if (!trimmedPrompt || isTurnActive || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await sendMessage({ content: trimmedPrompt });
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void handleSubmit();
  };

  if (!open) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-end px-4">
        <Button
          className="pointer-events-auto h-11 rounded-full border border-border/70 bg-card/95 px-4 shadow-xl supports-backdrop-filter:backdrop-blur-xl"
          onClick={() => setOpen({ open: true })}
        >
          <Sparkles className="size-4" />
          <span>Stave Assistant</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-end px-4">
      <Card className="pointer-events-auto flex h-[min(72vh,680px)] w-full max-w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden border border-border/70 bg-card/92 shadow-2xl supports-backdrop-filter:backdrop-blur-xl">
        <div className="border-b border-border/60 bg-muted/30 px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1 rounded-full px-2.5 py-0.5">
                  <Bot className="size-3.5" />
                  Stave Assistant
                </Badge>
                {assistantAutoHandoffToTask ? (
                  <Badge variant="outline" className="rounded-full px-2.5 py-0.5">
                    Auto handoff
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 truncate text-sm font-medium text-foreground">
                {projectName ?? (projectPath ? "Current Project" : "No project open")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {activeWorkspaceName ? `${activeWorkspaceName} · ${currentTargetLabel}` : currentTargetLabel}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent(STAVE_ASSISTANT_OPEN_SETTINGS_EVENT, {
                    detail: { section: "assistant" },
                  }));
                }}
              >
                <Settings2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => clearConversation()}
              >
                <Trash2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen({ open: false })}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select
              value={targetKind}
              onValueChange={(value) => setTarget({ kind: value as typeof targetKind })}
            >
              <SelectTrigger className="h-8 w-[11rem] rounded-md border-border/70 bg-background/70 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="truncate text-[11px] text-muted-foreground">
              {modelSummary}
            </span>
          </div>
        </div>

        <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
          {messages.length === 0 ? (
            <Empty className="h-full border-0 bg-transparent">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Sparkles className="size-5" />
                </EmptyMedia>
                <EmptyTitle>Global control plane for Stave</EmptyTitle>
                <EmptyDescription>
                  Ask about Stave, switch workspace, open panels, or update the Information panel.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn("flex w-full", message.role === "user" ? "justify-end" : "justify-start")}
                >
                  {message.role === "user" ? (
                    <UserMessageBubble content={message.content} />
                  ) : (
                    <AssistantMessageCard
                      message={message}
                      streamingEnabled
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border/60 bg-background/80 px-3.5 py-3">
          <div className="rounded-2xl border border-border/70 bg-background/90 px-3 py-3 shadow-sm">
            <Textarea
              ref={textareaRef}
              value={promptText}
              rows={3}
              placeholder="Ask Stave to explain, navigate, or prepare a task handoff..."
              className="min-h-[5.5rem] resize-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
              onChange={(event) => updatePromptDraft({ patch: { text: event.target.value } })}
              onKeyDown={handleKeyDown}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                Shift+Enter for newline. Complex implementation work is handed off into a task.
              </p>
              <div className="flex items-center gap-2">
                {isTurnActive ? (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => abortTurn()}>
                    <Square className="size-3.5" />
                    Stop
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!trimmedPrompt || isTurnActive || submitting}
                  onClick={() => void handleSubmit()}
                >
                  <Sparkles className="size-3.5" />
                  Send
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Bot, LoaderCircle, Settings2, Sparkles, Square, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Badge, Button, Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/ui";
import { ModelIcon } from "@/components/ai-elements";
import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { STAVE_MUSE_SESSION_ID } from "@/lib/stave-muse";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { STAVE_MUSE_OPEN_SETTINGS_EVENT, useAppStore } from "@/store/app.store";

const TARGET_OPTIONS = [
  { value: "app", label: "App" },
  { value: "project", label: "Current Project" },
  { value: "workspace", label: "Current Workspace" },
] as const;

const FLOATING_TOGGLE_BOTTOM_PX = 68;
const FLOATING_TOGGLE_SIZE_PX = 40;
const FLOATING_PANEL_GAP_PX = 12;
const MUSE_LAYER_Z_INDEX = 120;

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
        taskId={STAVE_MUSE_SESSION_ID}
        messageId={args.message.id}
        streamingEnabled={args.streamingEnabled}
        traceExpansionMode="manual"
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

export function StaveMuseWidget(args: { rightInset?: number }) {
  const [
    open,
    targetKind,
    messages,
    promptText,
    focusNonce,
    activeTurnId,
    museRouterModel,
    museChatModel,
    musePlannerModel,
    museAutoHandoffToTask,
    projectName,
    projectPath,
    activeWorkspaceName,
    workspaceSidebarCollapsed,
    setOpen,
    setTarget,
    clearConversation,
    updatePromptDraft,
    sendMessage,
    abortTurn,
  ] = useAppStore(useShallow((state) => [
    state.staveMuse.open,
    state.staveMuse.target.kind,
    state.staveMuse.messages,
    state.staveMuse.promptDraft.text,
    state.staveMuse.focusNonce,
    state.staveMuse.activeTurnId,
    state.settings.museRouterModel,
    state.settings.museChatModel,
    state.settings.musePlannerModel,
    state.settings.museAutoHandoffToTask,
    state.projectName,
    state.projectPath,
    state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.name ?? null,
    state.layout.workspaceSidebarCollapsed,
    state.setStaveMuseOpen,
    state.setStaveMuseTarget,
    state.clearStaveMuseConversation,
    state.updateStaveMusePromptDraft,
    state.sendStaveMuseMessage,
    state.abortStaveMuseTurn,
  ] as const));
  const [submitting, setSubmitting] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const floatingToggleLeftPx = workspaceSidebarCollapsed ? 8 : 12;
  const openContainerStyle = {
    left: `${floatingToggleLeftPx + FLOATING_TOGGLE_SIZE_PX + FLOATING_PANEL_GAP_PX}px`,
    right: args.rightInset && args.rightInset > 0 ? `${16 + args.rightInset}px` : "16px",
    bottom: `${FLOATING_TOGGLE_BOTTOM_PX}px`,
    zIndex: MUSE_LAYER_Z_INDEX,
  } as const;
  const floatingToggleStyle = {
    left: `${floatingToggleLeftPx}px`,
    bottom: `${FLOATING_TOGGLE_BOTTOM_PX}px`,
    zIndex: MUSE_LAYER_Z_INDEX,
  } as const;
  const isTurnActive = Boolean(activeTurnId);
  const isBusy = submitting || isTurnActive;
  const livePromptText = textareaRef.current?.value ?? promptText;
  const trimmedPrompt = livePromptText.trim();
  const workspaceLabel = activeWorkspaceName ?? "No workspace selected";
  const modelSummary = useMemo(() => [
    `Chat: ${toHumanModelName({ model: museChatModel })}`,
    `Planner: ${toHumanModelName({ model: musePlannerModel })}`,
    `Router: ${toHumanModelName({ model: museRouterModel })}`,
  ].join(" · "), [museChatModel, musePlannerModel, museRouterModel]);

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
    const nextPrompt = (textareaRef.current?.value ?? promptText).trim();
    if (!nextPrompt || isTurnActive || submitting || isComposing) {
      return;
    }
    setSubmitting(true);
    try {
      await sendMessage({ content: nextPrompt });
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || isComposing) {
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void handleSubmit();
  };

  if (!open) {
    return (
      <div className="pointer-events-none fixed" style={floatingToggleStyle}>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Open Stave Muse"
          className="pointer-events-auto rounded-xl border border-sidebar-border/90 bg-sidebar text-sidebar-foreground shadow-2xl ring-1 ring-sidebar-border/45 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground supports-backdrop-filter:bg-sidebar/96 supports-backdrop-filter:backdrop-blur-xl"
          onClick={() => setOpen({ open: true })}
        >
          <Sparkles className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed flex justify-start" style={openContainerStyle}>
      <Card className="pointer-events-auto flex h-[min(72vh,680px)] w-full max-w-[min(30rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden border border-border/70 bg-card/92 py-0 shadow-2xl supports-backdrop-filter:backdrop-blur-xl">
        <div className="border-b border-border/60 bg-muted/30 px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-6 gap-1.5 rounded-full text-sm [&>svg]:size-3.5!">
                  Stave Muse
                  <Bot className="size-3.5" />
                </Badge>
                {museAutoHandoffToTask ? (
                  <Badge variant="outline" className="rounded-full px-2.5 py-0.5">
                    Auto handoff
                  </Badge>
                ) : null}
                {isBusy ? (
                  <Badge variant="outline" className="gap-1.5 rounded-full px-2.5 py-0.5 text-primary [&>svg]:size-3.5!">
                    <LoaderCircle className="animate-spin" />
                    Responding
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent(STAVE_MUSE_OPEN_SETTINGS_EVENT, {
                    detail: { section: "muse" },
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
          <div className="mt-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {projectName ?? (projectPath ? "Current Project" : "No project open")}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {workspaceLabel}
              </p>
            </div>
            <Select
              value={targetKind}
              onValueChange={(value) => setTarget({ kind: value as typeof targetKind })}
            >
              <SelectTrigger className="ml-auto h-8 w-[11rem] shrink-0 rounded-md border-border/70 bg-background text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[121]">
                {TARGET_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground">
            <span className="truncate">{modelSummary}</span>
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
              placeholder="Ask Muse to explain, navigate, or prepare a task handoff..."
              className="min-h-[5.5rem] resize-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
              onChange={(event) => updatePromptDraft({ patch: { text: event.target.value } })}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={(event) => {
                setIsComposing(false);
                updatePromptDraft({ patch: { text: event.currentTarget.value } });
              }}
              onKeyDown={handleKeyDown}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2 text-[11px] text-muted-foreground">
                {isBusy ? (
                  <>
                    <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" />
                    <p className="truncate">Stave Muse is responding...</p>
                  </>
                ) : (
                  <p className="truncate">Shift+Enter for newline. Complex implementation work is handed off into a task.</p>
                )}
              </div>
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
                  disabled={!trimmedPrompt || isBusy}
                  onClick={() => void handleSubmit()}
                >
                  {isBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  {isBusy ? "Working" : "Send"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

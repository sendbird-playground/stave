import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { ArrowDownRight, ArrowUpRight, MessageSquareIcon, Zap } from "lucide-react";
import { Badge, Button, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, WaveIndicator } from "@/components/ui";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationVirtualList,
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  ModelIcon,
} from "@/components/ai-elements";
import { getMessageScrollFingerprint, shouldShowConversationLoadingState } from "@/components/session/chat-panel.utils";
import { canTakeOverTask, getTaskControlOwner, isTaskManaged, formatTaskUpdatedAt } from "@/lib/tasks";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, MessagePart } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import { CopyButton, toProviderStartCase, toProviderWaveToneClass } from "./chat-panel-message-parts";
import { AssistantMessageBody, hasVisibleAssistantMessageBody } from "./message/assistant-trace";
import { SessionLoadingState } from "./SessionLoadingState";

const EMPTY_MESSAGES: ChatMessage[] = [];

const MemoizedAssistantMessageBody = memo(AssistantMessageBody);

function formatElapsedLabel(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function getMessageElapsedLabel(args: {
  message: Pick<ChatMessage, "startedAt" | "completedAt">;
  nowMs?: number;
}) {
  const startedAt = args.message.startedAt ? Date.parse(args.message.startedAt) : Number.NaN;
  if (!Number.isFinite(startedAt)) {
    return null;
  }
  const endMs = args.message.completedAt
    ? Date.parse(args.message.completedAt)
    : args.nowMs;
  if (!Number.isFinite(endMs ?? Number.NaN)) {
    return null;
  }
  return formatElapsedLabel(Math.max(0, (endMs ?? startedAt) - startedAt));
}

/* ─── Token / cost formatting ────────────────────────────────────── */

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${(count / 1_000).toFixed(0)}k`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function formatCostUsd(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

type MessageUsage = NonNullable<ChatMessage["usage"]>;

interface MessageRowProps {
  activeTaskId: string;
  activeTurnId?: string;
  chatStreamingEnabled: boolean;
  elapsedAnchorMs?: number;
  isFirst?: boolean;
  liveStreamingMessageId?: string;
  zenMode?: boolean;
  message: {
    id: string;
    role: "user" | "assistant";
    providerId: "claude-code" | "codex" | "stave" | "user";
    model: string;
    content: string;
    startedAt?: string;
    completedAt?: string;
    parts: MessagePart[];
    isStreaming?: boolean;
    usage?: MessageUsage;
  };
}


const MessageRow = memo(function MessageRow(args: MessageRowProps) {
  const { activeTaskId, activeTurnId, chatStreamingEnabled, elapsedAnchorMs, isFirst, liveStreamingMessageId, message, zenMode = false } = args;
  const hasVisibleZenBody = useMemo(
    () => (!zenMode ? true : hasVisibleAssistantMessageBody({ message, zenMode: true })),
    [message, zenMode],
  );
  const showRespondingWave =
    Boolean(activeTurnId)
    && message.id === liveStreamingMessageId
    && message.role === "assistant"
    && message.isStreaming;
  const elapsedLabel = useMemo(
    () => getMessageElapsedLabel({ message, nowMs: elapsedAnchorMs }),
    [elapsedAnchorMs, message]
  );

  if (zenMode && message.role === "assistant" && !hasVisibleZenBody) {
    return null;
  }

  return (
    <div data-message-id={message.id} className={cn(isFirst && "pt-3 sm:pt-4")}>
      <Message from={message.role}>
        <div
          className={cn(
            "group/message-shell flex flex-col items-stretch",
            zenMode
              ? "w-full gap-2"
              : message.role === "assistant"
                ? "w-full max-w-4xl gap-1.5"
                : "min-w-0 max-w-[88%] w-fit gap-1",
          )}
        >
          {zenMode ? (
            <div
              className={cn(
                "mb-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em]",
                message.role === "user"
                  ? "justify-end text-primary/80"
                  : "justify-start text-muted-foreground/80",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  message.role === "user" ? "bg-primary" : "bg-muted-foreground/70",
                )}
                aria-hidden="true"
              />
              <span>{message.role === "user" ? "USER" : "AGENT"}</span>
              {message.role === "assistant" ? (
                <span className="text-muted-foreground/55">
                  {message.providerId === "user" ? "Assistant" : toProviderStartCase({ providerId: message.providerId })}
                </span>
              ) : null}
            </div>
          ) : null}
          <MessageContent
            minimal={zenMode}
            className={cn(
              message.role === "assistant" && !zenMode ? "pb-1" : undefined,
              zenMode && message.role === "assistant" && "w-full max-w-[72ch] self-start pb-0 text-left text-[0.98em] tracking-[-0.01em]",
              zenMode && message.role === "user" && "w-full max-w-[38ch] self-end pb-0 text-right text-[0.98em] tracking-[-0.01em]",
            )}
          >
            <MemoizedAssistantMessageBody
              message={message}
              taskId={activeTaskId}
              messageId={message.id}
              streamingEnabled={chatStreamingEnabled}
              zenMode={zenMode}
            />
          </MessageContent>
          {!zenMode ? (
            <MessageActions
              className={cn(
                message.role === "user" && "pointer-events-none self-end !ml-0 !mt-1 opacity-0 transition-opacity group-hover/message-shell:pointer-events-auto group-hover/message-shell:opacity-100",
                message.role === "assistant" && "self-stretch !ml-0 !mt-1",
              )}
            >
              <div className="flex min-w-0 items-center gap-1">
                {message.providerId !== "user" && message.model ? (
                  <MessageAction
                    key="provider-action"
                    label={toHumanModelName({ model: message.model })}
                    className="pointer-events-none h-7 cursor-default rounded-sm border border-border/70 bg-background/80 px-2 text-sm font-normal text-foreground opacity-100 supports-backdrop-filter:backdrop-blur-xs"
                  >
                    <ModelIcon providerId={message.providerId} className="size-3.5" />
                    {toHumanModelName({ model: message.model })}
                  </MessageAction>
                ) : null}
                {message.role === "assistant" && elapsedLabel ? (
                  <MessageAction
                    key="elapsed-action"
                    label="Elapsed time"
                    className="pointer-events-none h-7 cursor-default rounded-sm px-2 text-sm font-normal text-muted-foreground opacity-100 gap-1.5"
                  >
                    {showRespondingWave ? (
                      <WaveIndicator className={cn("size-3.5", toProviderWaveToneClass({ providerId: message.providerId, model: message.model }))} animate />
                    ) : null}
                    {elapsedLabel}
                  </MessageAction>
                ) : null}
                <CopyButton key="copy-action" text={message.content} />
                {message.role === "assistant" && message.usage && !showRespondingWave ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex cursor-default items-center gap-1.5 pl-1 text-[11px] leading-none text-muted-foreground/40">
                          <span className="inline-flex items-center gap-0.5">
                            <ArrowUpRight className="size-2.5" />
                            {formatTokenCount(message.usage.inputTokens)}
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <ArrowDownRight className="size-2.5" />
                            {formatTokenCount(message.usage.outputTokens)}
                          </span>
                          {message.usage.cacheReadTokens ? (
                            <span className="inline-flex items-center gap-0.5">
                              <Zap className="size-2.5" />
                              {formatTokenCount(message.usage.cacheReadTokens)}
                            </span>
                          ) : null}
                          {message.usage.totalCostUsd != null ? (
                            <span>{formatCostUsd(message.usage.totalCostUsd)}</span>
                          ) : null}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                          <span className="text-muted-foreground">Input</span>
                          <span className="text-right font-mono">{message.usage.inputTokens.toLocaleString()} tokens</span>
                          <span className="text-muted-foreground">Output</span>
                          <span className="text-right font-mono">{message.usage.outputTokens.toLocaleString()} tokens</span>
                          {message.usage.cacheReadTokens ? (
                            <>
                              <span className="text-muted-foreground">Cache read</span>
                              <span className="text-right font-mono">{message.usage.cacheReadTokens.toLocaleString()} tokens</span>
                            </>
                          ) : null}
                          {message.usage.cacheCreationTokens ? (
                            <>
                              <span className="text-muted-foreground">Cache write</span>
                              <span className="text-right font-mono">{message.usage.cacheCreationTokens.toLocaleString()} tokens</span>
                            </>
                          ) : null}
                          {message.usage.totalCostUsd != null ? (
                            <>
                              <span className="text-muted-foreground">Cost</span>
                              <span className="text-right font-mono">{formatCostUsd(message.usage.totalCostUsd)}</span>
                            </>
                          ) : null}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
              </div>
            </MessageActions>
          ) : null}
        </div>
      </Message>
    </div>
  );
});

function ChatPanelHeader() {
  const [
    activeTaskId,
    activeTask,
    activeTaskTitle,
    activeTaskUpdatedAt,
    activeTurnId,
    takeOverTask,
  ] = useAppStore(useShallow((state) => {
    const activeTask = state.tasks.find((task) => task.id === state.activeTaskId);
    return [
      state.activeTaskId,
      activeTask ?? null,
      activeTask?.title ?? "Untitled Task",
      activeTask?.updatedAt,
      state.activeTurnIdsByTask[state.activeTaskId],
      state.takeOverTask,
    ] as const;
  }));
  const [timeAnchor, setTimeAnchor] = useState(() => Date.now());
  const isManagedTask = isTaskManaged(activeTask);
  const canTakeOver = canTakeOverTask({ task: activeTask, activeTurnId });
  const managedLabel = isManagedTask
    ? `Managed by ${getTaskControlOwner(activeTask) === "external" ? "external controller" : "Stave"}`
    : null;

  useEffect(() => {
    const handle = window.setInterval(() => {
      setTimeAnchor(Date.now());
    }, 60_000);
    return () => window.clearInterval(handle);
  }, []);

  return (
    <>
      <header className="flex h-10 items-center justify-between border-b border-border/80 bg-card px-3 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium text-foreground">{activeTaskTitle}</span>
          {managedLabel ? (
            <Badge variant="secondary" className="shrink-0 rounded-sm text-[10px] uppercase tracking-[0.14em]">
              Managed
            </Badge>
          ) : null}
          {activeTaskUpdatedAt ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatTaskUpdatedAt({ value: activeTaskUpdatedAt, now: timeAnchor })}
            </span>
          ) : null}
          {managedLabel ? (
            <span className="truncate text-xs text-muted-foreground">
              {activeTurnId ? managedLabel : `${managedLabel}. Take over to continue here.`}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isManagedTask ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canTakeOver}
              className="h-7 rounded-sm px-2 text-xs shadow-none"
              onClick={() => takeOverTask({ taskId: activeTaskId })}
            >
              Take Over
            </Button>
          ) : null}
        </div>
      </header>
    </>
  );
}

const MemoizedChatPanelHeader = memo(ChatPanelHeader);

function ChatPanelMessageList(args: { zenMode?: boolean }) {
  const [activeWorkspaceId, activeTaskId, activeTurnId, chatStreamingEnabled, loadTaskMessages] = useAppStore(useShallow((state) => [
    state.activeWorkspaceId,
    state.activeTaskId,
    state.activeTurnIdsByTask[state.activeTaskId],
    state.settings.chatStreamingEnabled,
    state.loadTaskMessages,
  ] as const));
  const messages = useAppStore((state) => state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES);
  const totalMessageCount = useAppStore((state) => state.messageCountByTask[state.activeTaskId] ?? 0);
  const taskMessagesLoading = useAppStore((state) => state.taskMessagesLoadingByTask[state.activeTaskId] === true);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [elapsedAnchorMs, setElapsedAnchorMs] = useState(() => Date.now());
  const [turnCompletionScrollTick, setTurnCompletionScrollTick] = useState(0);
  const previousActiveTurnIdRef = useRef<string | undefined>(activeTurnId);

  const visibleMessages = useMemo(
    () => messages.filter((message) => (
      !message.isPlanResponse
      && (
        !args.zenMode
        || message.role !== "assistant"
        || hasVisibleAssistantMessageBody({ message, zenMode: true })
      )
    )),
    [args.zenMode, messages],
  );
  const hasOlderMessages = messages.length < totalMessageCount;
  const showConversationLoadingState = shouldShowConversationLoadingState({
    visibleMessageCount: visibleMessages.length,
    totalMessageCount,
    taskMessagesLoading,
  });
  const liveStreamingMessageId = activeTurnId ? visibleMessages.at(-1)?.id : undefined;
  const latestVisibleMessageId = visibleMessages.at(-1)?.id;
  const lastVisibleMessageScrollFingerprint = useMemo(
    () => getMessageScrollFingerprint(visibleMessages.at(-1)),
    [visibleMessages]
  );
  const autoScrollKey = `${visibleMessages.length}:${lastVisibleMessageScrollFingerprint}`;
  const forceScrollKey = `${latestVisibleMessageId ?? "none"}:${turnCompletionScrollTick}`;
  const scrollContextKey = `${activeWorkspaceId}:${activeTaskId}`;

  useEffect(() => {
    if (previousActiveTurnIdRef.current && !activeTurnId) {
      setTurnCompletionScrollTick((current) => current + 1);
    }
    previousActiveTurnIdRef.current = activeTurnId;
  }, [activeTurnId]);

  useEffect(() => {
    if (!activeTurnId) {
      return;
    }
    const handle = window.setInterval(() => {
      setElapsedAnchorMs(Date.now());
    }, 1000);
    return () => window.clearInterval(handle);
  }, [activeTurnId]);

  return (
    <ConversationContent
      autoScrollKey={autoScrollKey}
      autoScrollBehavior="auto"
      forceScrollKey={forceScrollKey}
      scrollScopeKey={scrollContextKey}
      forceScrollScopeKey={scrollContextKey}
      withInnerLayout={!args.zenMode && visibleMessages.length === 0 && !showConversationLoadingState}
      className={args.zenMode ? "zen-conversation-scroll" : undefined}
    >
      {hasOlderMessages ? (
        <div className={cn(
          "mx-auto mb-3 flex w-full pt-3",
          args.zenMode ? "max-w-[82ch] px-2 sm:px-0" : "max-w-6xl px-3 sm:px-5 sm:pt-4",
        )}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={taskMessagesLoading}
            className="h-8 rounded-sm"
            onClick={() => {
              void loadTaskMessages({ taskId: activeTaskId, mode: "older" });
            }}
          >
            {taskMessagesLoading
              ? "Loading older messages..."
              : `Load older messages (${totalMessageCount - messages.length} remaining)`}
          </Button>
        </div>
      ) : null}
      {showConversationLoadingState ? (
        <SessionLoadingState
          testId="conversation-loading-state"
          title="Loading conversation"
          description="Fetching the latest messages for this task."
        />
      ) : visibleMessages.length === 0 ? (
        <div className={cn(args.zenMode && "mx-auto flex w-full max-w-[82ch] flex-1 px-2 py-4 sm:px-0")}>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareIcon />
              </EmptyMedia>
              <EmptyTitle>Start a conversation</EmptyTitle>
              <EmptyDescription>Send a prompt to begin this task.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ConversationVirtualList
          listKey={scrollContextKey}
          listRef={virtuosoRef}
          data={visibleMessages}
          forceScrollKey={forceScrollKey}
          forceScrollScopeKey={scrollContextKey}
          layout={args.zenMode ? "zen" : "default"}
          itemKey={(_, message) => message.id}
          itemContent={(index, message) => (
            <MessageRow
              activeTaskId={activeTaskId}
              activeTurnId={activeTurnId}
              chatStreamingEnabled={chatStreamingEnabled}
              elapsedAnchorMs={message.id === liveStreamingMessageId ? elapsedAnchorMs : undefined}
              isFirst={index === 0}
              liveStreamingMessageId={liveStreamingMessageId}
              zenMode={args.zenMode}
              message={message}
            />
          )}
        />
      )}
    </ConversationContent>
  );
}

const MemoizedChatPanelMessageList = memo(ChatPanelMessageList);

export function ChatPanel(args: { zenMode?: boolean }) {
  return (
    <Conversation>
      <div className="flex h-full w-full flex-col">
        {args.zenMode ? null : <MemoizedChatPanelHeader />}
        <MemoizedChatPanelMessageList zenMode={args.zenMode} />
      </div>
      <ConversationScrollButton tooltip="Scroll to bottom" />
    </Conversation>
  );
}

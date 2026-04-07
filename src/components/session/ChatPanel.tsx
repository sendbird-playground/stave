import { memo, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, MessageSquareIcon, Zap } from "lucide-react";
import {
  Conversation,
  ConversationScrollButton,
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  ModelIcon,
} from "@/components/ai-elements";
import { Badge, Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, WaveIndicator } from "@/components/ui";
import { canTakeOverTask, formatTaskUpdatedAt, getTaskControlOwner, isTaskManaged } from "@/lib/tasks";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, MessagePart } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import { CopyButton, toProviderStartCase, toProviderWaveToneClass } from "./chat-panel-message-parts";
import { ChatPanelMessageListScaffold, type ChatPanelRowRenderArgs } from "./chat-panel.shared";
import { AssistantMessageBody } from "./message/assistant-trace";

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

interface StandardMessageRowProps extends ChatPanelRowRenderArgs {
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

const MessageRow = memo(function MessageRow(args: StandardMessageRowProps) {
  const { activeTaskId, activeTurnId, chatStreamingEnabled, elapsedAnchorMs, isFirst, liveStreamingMessageId, message } = args;
  const showRespondingWave =
    Boolean(activeTurnId)
    && message.id === liveStreamingMessageId
    && message.role === "assistant"
    && message.isStreaming;
  const elapsedLabel = useMemo(
    () => getMessageElapsedLabel({ message, nowMs: elapsedAnchorMs }),
    [elapsedAnchorMs, message]
  );

  return (
    <div data-message-id={message.id} className={cn(isFirst && "pt-3 sm:pt-4")}>
      <Message from={message.role}>
        <div
          className={cn(
            "group/message-shell flex flex-col items-stretch",
            message.role === "assistant" ? "w-full max-w-4xl gap-1.5" : "min-w-0 max-w-[88%] w-fit gap-1",
          )}
        >
          <MessageContent className={message.role === "assistant" ? "pb-1" : undefined}>
            <AssistantMessageBody
              message={message}
              taskId={activeTaskId}
              messageId={message.id}
              streamingEnabled={chatStreamingEnabled}
            />
          </MessageContent>
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
                  className="pointer-events-none h-7 cursor-default gap-1.5 rounded-sm px-2 text-sm font-normal text-muted-foreground opacity-100"
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
  const managedLabel =
    isManagedTask
      ? `Managed by ${getTaskControlOwner(activeTask) === "external" ? "external controller" : "Stave"}`
      : null;

  useEffect(() => {
    const handle = window.setInterval(() => {
      setTimeAnchor(Date.now());
    }, 60_000);
    return () => window.clearInterval(handle);
  }, []);

  return (
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
  );
}

const MemoizedChatPanelHeader = memo(ChatPanelHeader);

const MemoizedChatPanelMessageList = memo(function ChatPanelMessageList() {
  return (
    <ChatPanelMessageListScaffold
      renderMessageRow={(rowArgs) => <MessageRow {...rowArgs} />}
    />
  );
});

export function ChatPanel() {
  return (
    <Conversation>
      <div className="flex h-full w-full flex-col">
        <MemoizedChatPanelHeader />
        <MemoizedChatPanelMessageList />
      </div>
      <ConversationScrollButton tooltip="Scroll to bottom" />
    </Conversation>
  );
}

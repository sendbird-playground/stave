import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { MessageSquareIcon } from "lucide-react";
import { Badge, Button, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, WaveIndicator } from "@/components/ui";
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
import { getMessageScrollFingerprint } from "@/components/session/chat-panel.utils";
import { canTakeOverTask, getTaskControlOwner, isTaskManaged, formatTaskUpdatedAt } from "@/lib/tasks";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, MessagePart } from "@/types/chat";
import { useShallow } from "zustand/react/shallow";
import { CopyButton, toProviderWaveToneClass } from "./chat-panel-message-parts";
import { AssistantMessageBody } from "./message/assistant-trace";

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

interface MessageRowProps {
  activeTaskId: string;
  activeTurnId?: string;
  chatStreamingEnabled: boolean;
  elapsedAnchorMs?: number;
  isFirst?: boolean;
  liveStreamingMessageId?: string;
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
  };
}


const MessageRow = memo(function MessageRow(args: MessageRowProps) {
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
            message.role === "assistant" ? "w-full max-w-4xl gap-1.5" : "max-w-[88%] w-fit gap-1",
          )}
        >
          <MessageContent>
            <MemoizedAssistantMessageBody
              message={message}
              taskId={activeTaskId}
              messageId={message.id}
              streamingEnabled={chatStreamingEnabled}
            />
          </MessageContent>
          <MessageActions
            className={cn(
              message.role === "user" && "pointer-events-none self-end !ml-0 !mt-1 opacity-0 transition-opacity group-hover/message-shell:pointer-events-auto group-hover/message-shell:opacity-100",
              message.role === "assistant" && "self-stretch !ml-0 !mt-0",
            )}
          >
            <div className="flex min-w-0 items-center gap-1">
              {message.providerId !== "user" && message.model ? (
                <MessageAction
                  key="provider-action"
                  label={toHumanModelName({ model: message.model })}
                  className="pointer-events-none h-7 cursor-default rounded-sm border border-border/70 bg-white dark:bg-white/[0.06] px-2 text-sm font-normal text-foreground opacity-100"
                >
                  <ModelIcon providerId={message.providerId} className="size-3.5" />
                  {toHumanModelName({ model: message.model })}
                </MessageAction>
              ) : null}
              {message.role === "assistant" && elapsedLabel ? (
                <MessageAction
                  key="elapsed-action"
                  label="Elapsed time"
                  className="pointer-events-none h-7 cursor-default rounded-sm border border-border/70 bg-background px-2 text-sm font-normal text-foreground opacity-100"
                >
                  <WaveIndicator className={cn("size-3.5", showRespondingWave ? toProviderWaveToneClass({ providerId: message.providerId, model: message.model }) : "text-muted-foreground")} />
                  {elapsedLabel}
                </MessageAction>
              ) : null}
              <CopyButton key="copy-action" text={message.content} />
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

function ChatPanelMessageList() {
  const [activeTaskId, activeTurnId, chatStreamingEnabled, loadTaskMessages] = useAppStore(useShallow((state) => [
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

  const visibleMessages = useMemo(() => messages.filter((message) => !message.isPlanResponse), [messages]);
  const hasOlderMessages = messages.length < totalMessageCount;
  const liveStreamingMessageId = activeTurnId ? visibleMessages.at(-1)?.id : undefined;
  const latestVisibleMessageId = visibleMessages.at(-1)?.id;
  const lastVisibleMessageScrollFingerprint = useMemo(
    () => getMessageScrollFingerprint(visibleMessages.at(-1)),
    [visibleMessages]
  );
  const autoScrollKey = `${visibleMessages.length}:${lastVisibleMessageScrollFingerprint}`;
  const forceScrollKey = latestVisibleMessageId;

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
      scrollScopeKey={activeTaskId}
      forceScrollScopeKey={activeTaskId}
      withInnerLayout={visibleMessages.length === 0}
    >
      {hasOlderMessages ? (
        <div className="mx-auto mb-3 flex w-full max-w-6xl px-3 pt-3 sm:px-5 sm:pt-4">
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
      {visibleMessages.length === 0 && totalMessageCount > 0 && taskMessagesLoading ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareIcon />
            </EmptyMedia>
            <EmptyTitle>Loading conversation</EmptyTitle>
            <EmptyDescription>Fetching the latest messages for this task.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : visibleMessages.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareIcon />
            </EmptyMedia>
            <EmptyTitle>Start a conversation</EmptyTitle>
            <EmptyDescription>Send a prompt to begin this task.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ConversationVirtualList
          listKey={activeTaskId}
          listRef={virtuosoRef}
          data={visibleMessages}
          forceScrollKey={forceScrollKey}
          forceScrollScopeKey={activeTaskId}
          itemKey={(_, message) => message.id}
          itemContent={(index, message) => (
            <MessageRow
              activeTaskId={activeTaskId}
              activeTurnId={activeTurnId}
              chatStreamingEnabled={chatStreamingEnabled}
              elapsedAnchorMs={message.id === liveStreamingMessageId ? elapsedAnchorMs : undefined}
              isFirst={index === 0}
              liveStreamingMessageId={liveStreamingMessageId}
              message={message}
            />
          )}
        />
      )}
    </ConversationContent>
  );
}

const MemoizedChatPanelMessageList = memo(ChatPanelMessageList);

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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VirtuosoHandle } from "react-virtuoso";
import { Clock3, MessageSquareIcon } from "lucide-react";
import { Button, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, WaveIndicator } from "@/components/ui";
import {
  ChainOfThought,
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationVirtualList,
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  ModelIcon,
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  ToolGroup,
} from "@/components/ai-elements";
import {
  getMessageBodyFallbackState,
  getMessageScrollFingerprint,
  getRenderableMessageParts,
  groupMessageParts,
  hasVisibleMessagePartContent,
  shouldRenderInlineToolPart,
  shouldAutoOpenToolGroup,
} from "@/components/session/chat-panel.utils";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { toHumanModelName } from "@/lib/providers/model-catalog";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage, MessagePart } from "@/types/chat";
import { SessionReplayDrawer, type SessionReplayRequestContext } from "@/components/session/SessionReplayDrawer";
import { useShallow } from "zustand/react/shallow";
import { BackgroundActionsSummary, buildChainOfThoughtSteps, CopyButton, MessagePartRenderer, toProviderWaveToneClass } from "./chat-panel-message-parts";
import { ChangedFilesBlock, ImageAttachmentBlock, ReferencedFilesBlock } from "./chat-panel-file-blocks";

const EMPTY_MESSAGES: ChatMessage[] = [];

function MessageBody(args: {
  message: { content?: string; parts: MessagePart[]; isStreaming?: boolean };
  taskId: string;
  messageId: string;
  streamingEnabled: boolean;
  onOpenReplay?: () => void;
}) {
  const { message, taskId, messageId, streamingEnabled, onOpenReplay } = args;
  const reasoningDefaultExpanded = useAppStore((state) => state.settings.reasoningDefaultExpanded);
  const isActivelyStreaming = Boolean(message.isStreaming);
  const isStreaming = streamingEnabled && isActivelyStreaming;
  const renderableParts = useMemo(() => getRenderableMessageParts({
    content: message.content ?? "",
    parts: message.parts,
  }), [message.content, message.parts]);
  const reasoningParts = useMemo(() => renderableParts.filter((part) => part.type === "thinking"), [renderableParts]);
  const hasReasoning = reasoningParts.length > 0;
  const reasoningText = useMemo(() => reasoningParts.map((part) => part.text).join(""), [reasoningParts]);
  const visibleParts = useMemo(() => renderableParts.filter(hasVisibleMessagePartContent), [renderableParts]);
  const chainOfThoughtSteps = useMemo(() => buildChainOfThoughtSteps(renderableParts), [renderableParts]);
  const hasChainOfThought = chainOfThoughtSteps.length > 0;
  const showChainOfThought = hasChainOfThought && !hasReasoning;
  const segments = useMemo(() => groupMessageParts(visibleParts), [visibleParts]);
  const replayOnlyToolParts = useMemo(
    () => renderableParts.filter((part) => part.type === "tool_use" && !shouldRenderInlineToolPart({ toolName: part.toolName })),
    [renderableParts]
  );
  const lastTextPartIndex = useMemo(
    () => visibleParts.map((p, i) => (p.type === "text" ? i : -1)).filter((i) => i !== -1).at(-1),
    [visibleParts]
  );
  const fallbackState = useMemo(() => getMessageBodyFallbackState({
    isActivelyStreaming,
    renderableParts,
  }), [isActivelyStreaming, renderableParts]);

  if (fallbackState === "streaming-placeholder") {
    return (
      <Reasoning isStreaming defaultOpen={reasoningDefaultExpanded}>
        <ReasoningTrigger />
        <ReasoningContent>Thinking...</ReasoningContent>
      </Reasoning>
    );
  }

  if (fallbackState === "empty-completed") {
    return <p className="text-sm italic text-muted-foreground">No response.</p>;
  }

  return (
    <>
      {hasReasoning ? (
        <Reasoning isStreaming={isStreaming} defaultOpen={reasoningDefaultExpanded}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText || "Thinking..."}</ReasoningContent>
        </Reasoning>
      ) : null}
      {showChainOfThought ? <ChainOfThought isStreaming={isStreaming} steps={chainOfThoughtSteps} className={hasReasoning ? "mt-2" : undefined} /> : null}
      {replayOnlyToolParts.length > 0 ? (
        <div className={cn("mt-2", !hasReasoning && !showChainOfThought && "mt-0")}>
          <BackgroundActionsSummary parts={replayOnlyToolParts} onOpenReplay={onOpenReplay} />
        </div>
      ) : null}
      {segments.map((segment) => {
        if (segment.kind === "tools") {
          const toolStates = segment.parts.map((p) => (p.type === "tool_use" ? p.state : undefined));
          const shouldAutoOpenGroup = shouldAutoOpenToolGroup(toolStates);
          return (
            <div key={`${messageId}-tools-${segment.startIndex}`} className="mt-2 first:mt-0">
              <ToolGroup
                states={toolStates}
                defaultOpen={shouldAutoOpenGroup}
                openWhen={shouldAutoOpenGroup}
              >
                {segment.parts.map((part, idx) => (
                  <MessagePartRenderer
                    key={`${messageId}-part-${segment.startIndex + idx}`}
                    part={part}
                    taskId={taskId}
                    messageId={messageId}
                    isStreaming={isStreaming}
                    isLastTextPart={false}
                  />
                ))}
              </ToolGroup>
            </div>
          );
        }
        if (segment.kind === "diffs") {
          return (
            <div key={`${messageId}-diffs-${segment.startIndex}`} className="mt-2 first:mt-0">
              <ChangedFilesBlock parts={segment.parts} taskId={taskId} messageId={messageId} startIndex={segment.startIndex} />
            </div>
          );
        }
        if (segment.kind === "file_contexts") {
          return (
            <div key={`${messageId}-file-contexts-${segment.startIndex}`} className="mt-2 first:mt-0">
              <ReferencedFilesBlock parts={segment.parts} />
            </div>
          );
        }
        if (segment.kind === "image_contexts") {
          return (
            <div key={`${messageId}-image-contexts-${segment.startIndex}`} className="mt-2 first:mt-0">
              <ImageAttachmentBlock parts={segment.parts} />
            </div>
          );
        }
        return (
          <div key={`${messageId}-part-${segment.index}`} className="mt-2 first:mt-0">
            <MessagePartRenderer
              part={segment.part}
              taskId={taskId}
              messageId={messageId}
              isStreaming={isStreaming}
              isLastTextPart={segment.index === lastTextPartIndex}
            />
          </div>
        );
      })}
    </>
  );
}

const MemoizedMessageBody = memo(MessageBody);

interface MessageRowProps {
  activeTaskId: string;
  activeTurnId?: string;
  chatStreamingEnabled: boolean;
  isFirst?: boolean;
  liveStreamingMessageId?: string;
  onOpenReplay?: () => void;
  message: {
    id: string;
    role: "user" | "assistant";
    providerId: "claude-code" | "codex" | "stave" | "user";
    model: string;
    content: string;
    parts: MessagePart[];
    isStreaming?: boolean;
  };
}


const MessageRow = memo(function MessageRow(args: MessageRowProps) {
  const { activeTaskId, activeTurnId, chatStreamingEnabled, isFirst, liveStreamingMessageId, message, onOpenReplay } = args;
  const showRespondingWave =
    Boolean(activeTurnId)
    && message.id === liveStreamingMessageId
    && message.role === "assistant"
    && message.isStreaming;

  return (
    <div data-message-id={message.id} className={cn(isFirst && "pt-3 sm:pt-4")}>
      <Message from={message.role}>
        <div
          className={cn(
            "group/message-shell flex max-w-[88%] flex-col items-stretch",
            message.role === "assistant" ? "w-full gap-1" : "w-fit",
          )}
        >
          <MessageContent>
            <MemoizedMessageBody
              message={message}
              taskId={activeTaskId}
              messageId={message.id}
              streamingEnabled={chatStreamingEnabled}
              onOpenReplay={onOpenReplay}
            />
          </MessageContent>
          <MessageActions
            className={cn(
              message.role === "user" && "pointer-events-none self-end !ml-0 !mt-1 opacity-0 transition-opacity group-hover/message-shell:pointer-events-auto group-hover/message-shell:opacity-100",
              message.role === "assistant" && "self-stretch !ml-0 !mt-0",
              showRespondingWave && "relative w-full items-center pr-10",
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
              <CopyButton key="copy-action" text={message.content} />
            </div>
            {showRespondingWave ? (
              <MessageAction
                key="responding-action"
                label="Responding"
                className="pointer-events-none absolute right-0 top-1/2 h-8 w-8 shrink-0 -translate-y-1/2 cursor-default p-0 opacity-100"
              >
                <WaveIndicator className={toProviderWaveToneClass({ providerId: message.providerId, model: message.model })} />
              </MessageAction>
            ) : null}
          </MessageActions>
        </div>
      </Message>
    </div>
  );
});

function ChatPanelHeader(args: {
  sessionReplayOpen: boolean;
  onOpenSessionReplay: (request?: Omit<SessionReplayRequestContext, "key">) => void;
}) {
  const [
    activeTaskId,
    activeWorkspaceId,
    activeTaskTitle,
    activeTaskUpdatedAt,
    turnDiagnosticsVisible,
  ] = useAppStore(useShallow((state) => {
    const activeTask = state.tasks.find((task) => task.id === state.activeTaskId);
    return [
      state.activeTaskId,
      state.activeWorkspaceId,
      activeTask?.title ?? "Untitled Task",
      activeTask?.updatedAt,
      state.settings.turnDiagnosticsVisible,
    ] as const;
  }));
  const [timeAnchor, setTimeAnchor] = useState(() => Date.now());
  const canOpenSessionReplay = Boolean(activeWorkspaceId && activeTaskId);

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
          {activeTaskUpdatedAt ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatTaskUpdatedAt({ value: activeTaskUpdatedAt, now: timeAnchor })}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {turnDiagnosticsVisible ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canOpenSessionReplay}
                    className={cn(
                      "h-7 rounded-sm px-2 text-xs shadow-none",
                      args.sessionReplayOpen
                        ? "border-border/80 bg-secondary/80 text-foreground hover:bg-secondary/80"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => args.onOpenSessionReplay({
                      view: "overview",
                      replayFilter: "all",
                    })}
                  >
                    <Clock3 className="size-3.5 shrink-0" />
                    <span>Replay</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open session replay</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </div>
      </header>
    </>
  );
}

const MemoizedChatPanelHeader = memo(ChatPanelHeader);

function ChatPanelMessageList(args: {
  onOpenSessionReplay: (request?: Omit<SessionReplayRequestContext, "key">) => void;
}) {
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const messages = useAppStore((state) => state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES);
  const activeTurnId = useAppStore((state) => state.activeTurnIdsByTask[state.activeTaskId]);
  const chatStreamingEnabled = useAppStore((state) => state.settings.chatStreamingEnabled);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);

  const visibleMessages = useMemo(() => messages.filter((message) => !message.isPlanResponse), [messages]);
  const liveStreamingMessageId = activeTurnId ? visibleMessages.at(-1)?.id : undefined;
  const latestVisibleMessageId = visibleMessages.at(-1)?.id;
  const lastVisibleMessageScrollFingerprint = useMemo(
    () => getMessageScrollFingerprint(visibleMessages.at(-1)),
    [visibleMessages]
  );
  const autoScrollKey = `${visibleMessages.length}:${lastVisibleMessageScrollFingerprint}`;
  const forceScrollKey = latestVisibleMessageId;

  return (
    <ConversationContent
      autoScrollKey={autoScrollKey}
      autoScrollBehavior="auto"
      forceScrollKey={forceScrollKey}
      scrollScopeKey={activeTaskId}
      forceScrollScopeKey={activeTaskId}
      withInnerLayout={visibleMessages.length === 0}
    >
      {visibleMessages.length === 0 ? (
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
              isFirst={index === 0}
              liveStreamingMessageId={liveStreamingMessageId}
              onOpenReplay={() => args.onOpenSessionReplay({
                view: "replay",
                replayFilter: "tools",
              })}
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
  const [sessionReplayOpen, setSessionReplayOpen] = useState(false);
  const replayRequestKeyRef = useRef(0);
  const [sessionReplayRequest, setSessionReplayRequest] = useState<SessionReplayRequestContext | null>(null);

  const openSessionReplay = useCallback((request?: Omit<SessionReplayRequestContext, "key">) => {
    replayRequestKeyRef.current += 1;
    setSessionReplayRequest({ key: replayRequestKeyRef.current, ...request });
    setSessionReplayOpen(true);
  }, []);

  return (
    <Conversation>
      <div className="flex h-full w-full flex-col">
        <MemoizedChatPanelHeader
          sessionReplayOpen={sessionReplayOpen}
          onOpenSessionReplay={openSessionReplay}
        />
        <MemoizedChatPanelMessageList onOpenSessionReplay={openSessionReplay} />
      </div>
      <SessionReplayDrawer open={sessionReplayOpen} onOpenChange={setSessionReplayOpen} request={sessionReplayRequest} />
      <ConversationScrollButton tooltip="Scroll to bottom" />
    </Conversation>
  );
}

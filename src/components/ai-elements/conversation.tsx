import type { ComponentPropsWithoutRef, ForwardedRef, HTMLAttributes, MutableRefObject, ReactNode } from "react";
import { createContext, forwardRef, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Download } from "lucide-react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

interface ConversationContextValue {
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerEl: HTMLDivElement | null;
  setContainerEl: (next: HTMLDivElement | null) => void;
  atBottom: boolean;
  setAtBottom: (next: boolean) => void;
  scrollToBottom: (args?: { behavior?: ScrollBehavior }) => void;
  setScrollToBottomOverride: (next: ScrollToBottomHandler | null) => void;
}

type ScrollToBottomArgs = { behavior?: ScrollBehavior };
type ScrollToBottomHandler = (args?: ScrollToBottomArgs) => void;

function toVirtualScrollBehavior(args?: ScrollToBottomArgs): "auto" | "smooth" | undefined {
  return args?.behavior === "smooth" ? "smooth" : "auto";
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

function useConversationContext() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error("Conversation components must be used inside <Conversation />.");
  }
  return context;
}

export function Conversation(props: HTMLAttributes<HTMLDivElement>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const scrollToBottomOverrideRef = useRef<ScrollToBottomHandler | null>(null);

  const scrollToBottom = (args?: ScrollToBottomArgs) => {
    if (scrollToBottomOverrideRef.current) {
      scrollToBottomOverrideRef.current(args);
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: args?.behavior ?? "auto" });
  };

  const contextValue = useMemo(() => ({
    containerRef,
    containerEl,
    setContainerEl,
    atBottom,
    setAtBottom,
    scrollToBottom,
    setScrollToBottomOverride: (next: ScrollToBottomHandler | null) => {
      scrollToBottomOverrideRef.current = next;
    },
  }), [atBottom, containerEl]);

  return (
    <ConversationContext.Provider value={contextValue}>
      <section className={cn("relative flex min-h-0 flex-1 bg-background", props.className)} {...props} />
    </ConversationContext.Provider>
  );
}

interface ConversationContentProps extends HTMLAttributes<HTMLDivElement> {
  autoScrollKey?: string | number;
  autoScrollBehavior?: ScrollBehavior;
  withInnerLayout?: boolean;
  onScrollPositionChange?: (args: { scrollTop: number; container: HTMLDivElement }) => void;
}

export function ConversationContent(props: ConversationContentProps) {
  const { containerRef, setContainerEl, atBottom, setAtBottom, scrollToBottom } = useConversationContext();
  const {
    children,
    autoScrollKey,
    autoScrollBehavior,
    withInnerLayout = true,
    onScrollPositionChange,
    ...rest
  } = props;
  const scrollFrameRef = useRef<number | null>(null);
  const lastReportedScrollTopRef = useRef<number>(0);

  useEffect(() => {
    if (atBottom) {
      scrollToBottom({ behavior: autoScrollBehavior ?? "auto" });
    }
  }, [atBottom, autoScrollBehavior, autoScrollKey, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        setContainerEl(node);
      }}
      className={cn("min-h-0 flex-1 overflow-y-auto", rest.className)}
      onScroll={(event) => {
        const target = event.currentTarget;
        const nextScrollTop = target.scrollTop;
        const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
        const nextAtBottom = distance < 32;
        if (nextAtBottom !== atBottom) {
          setAtBottom(nextAtBottom);
        }
        if (onScrollPositionChange && nextScrollTop !== lastReportedScrollTopRef.current) {
          if (scrollFrameRef.current !== null) {
            cancelAnimationFrame(scrollFrameRef.current);
          }
          scrollFrameRef.current = requestAnimationFrame(() => {
            scrollFrameRef.current = null;
            lastReportedScrollTopRef.current = nextScrollTop;
            onScrollPositionChange({ scrollTop: nextScrollTop, container: target });
          });
        }
      }}
      {...rest}
    >
      {withInnerLayout ? (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 py-3 sm:px-5">{children}</div>
      ) : children}
    </div>
  );
}

const VirtualListContainer = forwardRef(function VirtualListContainer(
  props: ComponentPropsWithoutRef<"div">,
  ref: ForwardedRef<HTMLDivElement>
) {
  const { className, ...rest } = props;
  return (
    <div
      ref={ref}
      className={cn("mx-auto w-full max-w-4xl px-3 py-3 sm:px-5", className)}
      {...rest}
    />
  );
});

function VirtualListItem(props: ComponentPropsWithoutRef<"div">) {
  const { className, ...rest } = props;
  return <div className={cn("pb-3 last:pb-0", className)} {...rest} />;
}

interface ConversationVirtualListProps<T> {
  data: T[];
  itemContent: (index: number, item: T) => ReactNode;
  itemKey?: (index: number, item: T) => string | number;
  listKey?: string | number;
  restoreItemIndex?: number;
  restoreItemId?: string;
  restoreItemOffset?: number;
  listRef?: MutableRefObject<VirtuosoHandle | null>;
}

export function ConversationVirtualList<T>(props: ConversationVirtualListProps<T>) {
  const { containerEl, setAtBottom, setScrollToBottomOverride } = useConversationContext();
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const lastIndex = props.data.length - 1;

  useEffect(() => {
    setScrollToBottomOverride(() => (args?: ScrollToBottomArgs) => {
      if (lastIndex < 0) {
        return;
      }
      virtuosoRef.current?.scrollToIndex({
        index: lastIndex,
        align: "end",
        behavior: toVirtualScrollBehavior(args),
      });
    });
    return () => {
      setScrollToBottomOverride(null);
    };
  }, [lastIndex, setScrollToBottomOverride]);

  useEffect(() => {
    if (!virtuosoRef.current) {
      return;
    }

    const rafIds: number[] = [];

    const restoreToBottom = () => {
      if (lastIndex < 0) {
        return;
      }
      virtuosoRef.current?.scrollToIndex({
        index: lastIndex,
        align: "end",
        behavior: "auto",
      });
    };

    const restoreToSavedAnchor = (index: number, offset: number) => {
      virtuosoRef.current?.scrollToIndex({
        index,
        align: "start",
        behavior: "auto",
      });
      if (offset > 0) {
        virtuosoRef.current?.scrollBy({
          top: offset,
          behavior: "auto",
        });
      }
    };

    const refineSavedAnchorPosition = (messageId: string, offset: number) => {
      if (!containerEl) {
        return false;
      }
      const anchorNode = Array.from(containerEl.querySelectorAll<HTMLElement>("[data-message-id]"))
        .find((node) => node.dataset.messageId === messageId);
      if (!anchorNode) {
        return false;
      }
      const containerTop = containerEl.getBoundingClientRect().top;
      const currentOffset = anchorNode.getBoundingClientRect().top - containerTop;
      const delta = Math.round(currentOffset + offset);
      if (Math.abs(delta) <= 1) {
        return true;
      }
      virtuosoRef.current?.scrollBy({
        top: delta,
        behavior: "auto",
      });
      return false;
    };

    const savedIndex = props.restoreItemIndex;
    if (savedIndex == null || savedIndex < 0 || savedIndex >= props.data.length) {
      restoreToBottom();
      return;
    }

    const savedOffset = props.restoreItemOffset ?? 0;
    const savedMessageId = props.restoreItemId;
    restoreToSavedAnchor(savedIndex, savedOffset);
    if (!savedMessageId) {
      return;
    }
    let attempts = 0;
    const maxAttempts = 4;
    const runPreciseRestore = () => {
      attempts += 1;
      const settled = refineSavedAnchorPosition(savedMessageId, savedOffset);
      if (!settled && attempts < maxAttempts) {
        rafIds.push(requestAnimationFrame(runPreciseRestore));
      }
    };
    rafIds.push(requestAnimationFrame(runPreciseRestore));
    return () => {
      rafIds.forEach((id) => cancelAnimationFrame(id));
    };
  }, [containerEl, lastIndex, props.data.length, props.listKey, props.restoreItemId, props.restoreItemIndex, props.restoreItemOffset]);

  return (
    <Virtuoso
      key={props.listKey}
      ref={(node) => {
        virtuosoRef.current = node;
        if (props.listRef) {
          props.listRef.current = node;
        }
      }}
      data={props.data}
      customScrollParent={containerEl ?? undefined}
      style={{ height: "100%" }}
      atBottomThreshold={32}
      atBottomStateChange={setAtBottom}
      computeItemKey={props.itemKey}
      components={{
        List: VirtualListContainer,
        Item: VirtualListItem,
      }}
      itemContent={props.itemContent}
    />
  );
}

export function ConversationEmptyState(args: {
  title: string;
  description: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[240px] flex-col items-center justify-center text-center", args.className)}>
      {args.icon ? <div className="mb-3 text-muted-foreground">{args.icon}</div> : null}
      <p className="text-lg font-semibold text-foreground/90">{args.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{args.description}</p>
    </div>
  );
}

export function ConversationScrollButton(props: HTMLAttributes<HTMLButtonElement>) {
  const { atBottom, scrollToBottom } = useConversationContext();
  if (atBottom) {
    return null;
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className={cn("absolute bottom-3 right-3 h-8 rounded-full px-2", props.className)}
      onClick={() => scrollToBottom({ behavior: "smooth" })}
      aria-label="scroll-to-bottom"
      type="button"
    >
      <ArrowDown className="size-4" />
    </Button>
  );
}

export interface ConversationMarkdownMessage {
  role: string;
  content: string;
}

export function messagesToMarkdown(
  messages: ConversationMarkdownMessage[],
  formatMessage?: (message: ConversationMarkdownMessage, index: number) => string
) {
  return messages
    .map((message, index) => {
      if (formatMessage) {
        return formatMessage(message, index);
      }
      return `## ${message.role}\n\n${message.content}`.trim();
    })
    .join("\n\n");
}

interface ConversationDownloadProps extends Omit<React.ComponentProps<typeof Button>, "onClick"> {
  messages: ConversationMarkdownMessage[];
  filename?: string;
  formatMessage?: (message: ConversationMarkdownMessage, index: number) => string;
}

export function ConversationDownload(args: ConversationDownloadProps) {
  const { messages, filename = `conversation-${new Date().toISOString().slice(0, 10)}.md`, formatMessage, className, ...props } = args;
  const disabled = messages.length === 0;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("absolute bottom-3 left-3 h-8 rounded-full px-2", className)}
      disabled={disabled}
      aria-label="download-conversation"
      onClick={() => {
        const markdown = messagesToMarkdown(messages, formatMessage);
        const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }}
      {...props}
    >
      <Download className="size-4" />
    </Button>
  );
}

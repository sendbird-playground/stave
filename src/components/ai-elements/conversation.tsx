import type { ComponentPropsWithoutRef, CSSProperties, ForwardedRef, HTMLAttributes, MutableRefObject, ReactNode } from "react";
import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Download } from "lucide-react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { cn } from "@/lib/utils";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";

interface ConversationContextValue {
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerEl: HTMLDivElement | null;
  setContainerEl: (next: HTMLDivElement | null) => void;
  atBottom: boolean;
  stickToBottom: boolean;
  setAtBottom: (next: boolean) => void;
  setStickToBottom: (next: boolean) => void;
  scrollToBottom: (args?: { behavior?: ScrollBehavior }) => void;
  setScrollToBottomOverride: (next: ScrollToBottomHandler | null) => void;
}

type ScrollToBottomArgs = { behavior?: ScrollBehavior };
type ScrollToBottomHandler = (args?: ScrollToBottomArgs) => void;

function toVirtualScrollBehavior(args?: ScrollToBottomArgs): "auto" | "smooth" | undefined {
  return args?.behavior === "smooth" ? "smooth" : "auto";
}

const ConversationContext = createContext<ConversationContextValue | null>(null);
const VIRTUAL_LIST_BOTTOM_GAP = 24;
// Threshold must exceed the bottom gap so the padding zone is always considered
// "at bottom" — otherwise auto-scroll disengages while still in the gap area.
const AT_BOTTOM_THRESHOLD = Math.max(32, VIRTUAL_LIST_BOTTOM_GAP + 8);

function withExtraPaddingBottom(style: CSSProperties | undefined, extra: number): CSSProperties {
  const paddingBottom = style?.paddingBottom;
  if (typeof paddingBottom === "number") {
    return { ...style, paddingBottom: paddingBottom + extra };
  }
  if (typeof paddingBottom === "string" && paddingBottom.length > 0) {
    return { ...style, paddingBottom: `calc(${paddingBottom} + ${extra}px)` };
  }
  return { ...style, paddingBottom: extra };
}

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
  // Use refs for scroll-tracking state to avoid context re-renders on every scroll event.
  // State is only used by consumers that need to reactively show/hide (e.g., scroll button).
  const atBottomRef = useRef(true);
  const stickToBottomRef = useRef(true);
  const [atBottom, setAtBottomState] = useState(true);
  const scrollToBottomOverrideRef = useRef<ScrollToBottomHandler | null>(null);

  const setAtBottom = useCallback((next: boolean) => {
    atBottomRef.current = next;
    // Only trigger a re-render when the value actually changes (for scroll button visibility).
    setAtBottomState((prev) => (prev === next ? prev : next));
  }, []);

  const setStickToBottom = useCallback((next: boolean) => {
    stickToBottomRef.current = next;
  }, []);

  const scrollToBottom = useCallback((args?: ScrollToBottomArgs) => {
    stickToBottomRef.current = true;
    // Always scroll the container directly — this is the most reliable path
    // with customScrollParent. The override (Virtuoso scrollToIndex) is called
    // as a supplementary hint but container.scrollTo is the primary driver.
    const container = containerRef.current;
    const behavior = args?.behavior ?? "auto";
    if (scrollToBottomOverrideRef.current) {
      scrollToBottomOverrideRef.current(args);
    }
    if (container) {
      // Use RAF to ensure the scroll happens after Virtuoso has processed
      // the scrollToIndex from the override (if any).
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior });
      });
    }
  }, []);

  const setScrollToBottomOverride = useCallback((next: ScrollToBottomHandler | null) => {
    scrollToBottomOverrideRef.current = next;
  }, []);

  // Context value only depends on containerEl and atBottom (for scroll button).
  // stickToBottom is read from ref to avoid cascading re-renders.
  const contextValue = useMemo(() => ({
    containerRef,
    containerEl,
    setContainerEl,
    atBottom,
    stickToBottom: stickToBottomRef.current,
    setAtBottom,
    setStickToBottom,
    scrollToBottom,
    setScrollToBottomOverride,
  }), [atBottom, containerEl, setAtBottom, setStickToBottom, scrollToBottom, setScrollToBottomOverride]);

  return (
    <ConversationContext.Provider value={contextValue}>
      <section className={cn("relative flex min-h-0 flex-1", props.className)} {...props} />
    </ConversationContext.Provider>
  );
}

interface ConversationContentProps extends HTMLAttributes<HTMLDivElement> {
  autoScrollKey?: string | number;
  autoScrollBehavior?: ScrollBehavior;
  scrollScopeKey?: string | number;
  forceScrollKey?: string | number;
  forceScrollScopeKey?: string | number;
  withInnerLayout?: boolean;
  onScrollPositionChange?: (args: { scrollTop: number; container: HTMLDivElement }) => void;
}

export function ConversationContent(props: ConversationContentProps) {
  const { containerRef, setContainerEl, setAtBottom, setStickToBottom, scrollToBottom } = useConversationContext();
  const {
    children,
    autoScrollKey,
    autoScrollBehavior,
    scrollScopeKey,
    forceScrollKey,
    forceScrollScopeKey,
    withInnerLayout = true,
    onScrollPositionChange,
    ...rest
  } = props;
  const scrollFrameRef = useRef<number | null>(null);
  const lastReportedScrollTopRef = useRef<number>(0);
  const lastAutoScrollScopeRef = useRef<{ initialized: boolean; scope?: string | number }>({
    initialized: false,
    scope: scrollScopeKey,
  });
  const lastForceScrollRequestRef = useRef<{ scope?: string | number; key?: string | number }>({
    scope: forceScrollScopeKey,
    key: forceScrollKey,
  });
  // Read stickToBottom from the parent ref to avoid dependency on context value changes.
  const stickToBottomRef = useRef(true);

  // Sync ref from context setter calls.
  const wrappedSetStickToBottom = useCallback((next: boolean) => {
    stickToBottomRef.current = next;
    setStickToBottom(next);
  }, [setStickToBottom]);

  useEffect(() => {
    const previous = lastAutoScrollScopeRef.current;
    const scopeChanged = !previous.initialized || previous.scope !== scrollScopeKey;
    lastAutoScrollScopeRef.current = {
      initialized: true,
      scope: scrollScopeKey,
    };
    if (!scopeChanged && stickToBottomRef.current) {
      scrollToBottom({ behavior: autoScrollBehavior ?? "auto" });
    }
  }, [autoScrollBehavior, autoScrollKey, scrollScopeKey, scrollToBottom]);

  useEffect(() => {
    const previous = lastForceScrollRequestRef.current;
    const scopeChanged = previous.scope !== forceScrollScopeKey;
    const shouldForceScroll = !scopeChanged && forceScrollKey != null && forceScrollKey !== previous.key;
    lastForceScrollRequestRef.current = {
      scope: forceScrollScopeKey,
      key: forceScrollKey,
    };
    if (!shouldForceScroll) {
      return;
    }
    // Re-enable auto-scroll so subsequent content updates (streaming) keep
    // following the bottom after this forced scroll.
    stickToBottomRef.current = true;
    const behavior = autoScrollBehavior ?? "auto";
    // Single RAF is sufficient — the double/triple RAF pattern caused jitter
    // by issuing multiple scroll commands across successive frames.
    const rafId = requestAnimationFrame(() => {
      scrollToBottom({ behavior });
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [autoScrollBehavior, forceScrollKey, forceScrollScopeKey, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  // Debounce scroll position reporting to reduce DOM queries during rapid scrolling.
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        setContainerEl(node);
      }}
      className={cn("min-h-0 flex-1 overflow-y-auto", rest.className)}
      onScroll={(event) => {
        const target = event.currentTarget;
        const distance = target.scrollHeight - target.scrollTop - target.clientHeight;
        const nextAtBottom = distance < AT_BOTTOM_THRESHOLD;
        setAtBottom(nextAtBottom);
        wrappedSetStickToBottom(nextAtBottom);

        if (onScrollPositionChange) {
          // Debounce scroll position tracking to avoid expensive DOM queries on every frame.
          if (scrollDebounceRef.current !== null) {
            clearTimeout(scrollDebounceRef.current);
          }
          scrollDebounceRef.current = setTimeout(() => {
            scrollDebounceRef.current = null;
            const currentScrollTop = target.scrollTop;
            if (currentScrollTop !== lastReportedScrollTopRef.current) {
              lastReportedScrollTopRef.current = currentScrollTop;
              onScrollPositionChange({ scrollTop: currentScrollTop, container: target });
            }
          }, 100);
        }
      }}
      {...rest}
    >
      {withInnerLayout ? (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-3 sm:px-5">{children}</div>
      ) : children}
    </div>
  );
}

const VirtualListContainer = forwardRef(function VirtualListContainer(
  props: ComponentPropsWithoutRef<"div">,
  ref: ForwardedRef<HTMLDivElement>
) {
  const { className, style, ...rest } = props;
  return (
    <div
      ref={ref}
      className={cn("mx-auto w-full max-w-6xl px-3 pt-4 sm:px-5 sm:pt-5", className)}
      style={withExtraPaddingBottom(style, VIRTUAL_LIST_BOTTOM_GAP)}
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
  forceScrollKey?: string | number;
  forceScrollScopeKey?: string | number;
  restoreItemIndex?: number;
  restoreItemId?: string;
  restoreItemOffset?: number;
  listRef?: MutableRefObject<VirtuosoHandle | null>;
}

export function ConversationVirtualList<T>(props: ConversationVirtualListProps<T>) {
  const { containerEl, setAtBottom, setScrollToBottomOverride } = useConversationContext();
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const stickToBottomRef = useRef(true);
  const lastForceScrollRequestRef = useRef<{ scope?: string | number; key?: string | number }>({
    scope: props.forceScrollScopeKey,
    key: props.forceScrollKey,
  });
  const lastListScopeRef = useRef<{ initialized: boolean; scope?: string | number }>({
    initialized: false,
    scope: props.listKey,
  });
  const lastIndex = props.data.length - 1;

  useEffect(() => {
    setScrollToBottomOverride(() => (args?: ScrollToBottomArgs) => {
      if (lastIndex < 0) {
        return;
      }
      stickToBottomRef.current = true;
      virtuosoRef.current?.scrollToIndex({
        index: lastIndex,
        align: "end",
        behavior: toVirtualScrollBehavior(args),
      });
      // Single follow-up scroll to ensure the container is fully at bottom.
      // The previous double-RAF pattern fought with Virtuoso's internal scroll.
      if (containerEl) {
        const behavior = args?.behavior ?? "auto";
        requestAnimationFrame(() => {
          containerEl.scrollTo({ top: containerEl.scrollHeight, behavior });
        });
      }
    });
    return () => {
      setScrollToBottomOverride(null);
    };
  }, [containerEl, lastIndex, setScrollToBottomOverride]);

  // Restore scroll position on task switch or data changes.
  // Uses a local stickToBottomRef to avoid re-running when the parent
  // stickToBottom state toggles during normal scrolling.
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
      const anchorNode = containerEl.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);
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

    const previousForceScroll = lastForceScrollRequestRef.current;
    const forceScrollScopeChanged = previousForceScroll.scope !== props.forceScrollScopeKey;
    const shouldForceRestoreBottom =
      !forceScrollScopeChanged
      && props.forceScrollKey != null
      && props.forceScrollKey !== previousForceScroll.key;
    lastForceScrollRequestRef.current = {
      scope: props.forceScrollScopeKey,
      key: props.forceScrollKey,
    };

    const previousListScope = lastListScopeRef.current;
    const listScopeChanged = !previousListScope.initialized || previousListScope.scope !== props.listKey;
    lastListScopeRef.current = {
      initialized: true,
      scope: props.listKey,
    };

    if (shouldForceRestoreBottom) {
      // Re-enable stickToBottom so Virtuoso's followOutput keeps pinning new
      // content after this forced restore (e.g. during streaming).
      stickToBottomRef.current = true;
      restoreToBottom();
      return;
    }
    if (!listScopeChanged && stickToBottomRef.current) {
      restoreToBottom();
      return;
    }

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
  }, [
    containerEl,
    lastIndex,
    props.data.length,
    props.forceScrollKey,
    props.forceScrollScopeKey,
    props.listKey,
    props.restoreItemId,
    props.restoreItemIndex,
    props.restoreItemOffset,
    // stickToBottom intentionally NOT in deps — read from ref to avoid
    // re-running this effect on every scroll near the bottom threshold.
  ]);

  // Sync stickToBottom ref from Virtuoso's atBottomStateChange.
  const handleAtBottomChange = useCallback((isAtBottom: boolean) => {
    stickToBottomRef.current = isAtBottom;
    setAtBottom(isAtBottom);
  }, [setAtBottom]);

  // Virtuoso's followOutput keeps the list pinned to the bottom when new content
  // is appended and the user was already at the bottom. This replaces the manual
  // auto-scroll logic that was causing jitter via cascading scroll commands.
  const followOutput = useCallback(() => {
    return stickToBottomRef.current ? "smooth" : false;
  }, []);

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
      initialTopMostItemIndex={lastIndex >= 0 ? lastIndex : 0}
      customScrollParent={containerEl ?? undefined}
      style={{ height: "100%" }}
      atBottomThreshold={AT_BOTTOM_THRESHOLD}
      atBottomStateChange={handleAtBottomChange}
      followOutput={followOutput}
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

interface ConversationScrollButtonProps extends HTMLAttributes<HTMLButtonElement> {
  tooltip?: string;
}

export function ConversationScrollButton(props: ConversationScrollButtonProps) {
  const { atBottom, scrollToBottom } = useConversationContext();
  if (atBottom) {
    return null;
  }

  const { tooltip, ...buttonProps } = props;
  const button = (
    <Button
      size="sm"
      variant="outline"
      className={cn("absolute bottom-3 right-3 h-8 rounded-full px-2", buttonProps.className)}
      onClick={() => {
        scrollToBottom({ behavior: "smooth" });
      }}
      aria-label="scroll-to-bottom"
      type="button"
      {...buttonProps}
    >
      <ArrowDown className="size-4" />
    </Button>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
  tooltip?: string;
}

export function ConversationDownload(args: ConversationDownloadProps) {
  const { messages, filename = `conversation-${new Date().toISOString().slice(0, 10)}.md`, formatMessage, className, tooltip, ...props } = args;
  const disabled = messages.length === 0;
  const button = (
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

  if (!tooltip) {
    return button;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

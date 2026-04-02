import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Check, ChevronDown, Circle, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Data type (used by the `steps` prop shorthand) ─────────────── */

export interface ChainOfThoughtStep {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "active" | "done";
  kind?: "thinking" | "tool" | "agent" | "system";
}

/* ─── Summary item (shown in collapsed trigger) ──────────────────── */

export interface TraceSummaryItem {
  icon: ReactNode;
  label: string;
  count: number;
}

/* ─── Props ──────────────────────────────────────────────────────── */

interface ChainOfThoughtProps extends HTMLAttributes<HTMLDivElement> {
  isStreaming?: boolean;
  defaultOpen?: boolean;
  openWhen?: boolean;
  collapseWhen?: boolean;
  steps?: ChainOfThoughtStep[];
  /** Summary items shown in the trigger when collapsed and not streaming. */
  summaryItems?: TraceSummaryItem[];
}

interface ChainOfThoughtStepProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  /** Always-visible description below the title (matches AI Elements API). */
  description?: ReactNode;
  /** Inline summary chip displayed next to the title. */
  summary?: ReactNode;
  status?: ChainOfThoughtStep["status"];
  kind?: ChainOfThoughtStep["kind"];
  /** Custom icon element to replace the default status icon. */
  icon?: ReactNode;
  /** "bullet" renders a small dot instead of the status icon (for plain text steps). */
  variant?: "default" | "bullet";
  defaultOpen?: boolean;
  openWhen?: boolean;
}

/* ─── Context ────────────────────────────────────────────────────── */

interface ChainOfThoughtContextValue {
  isStreaming: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
  summaryItems: TraceSummaryItem[];
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null);

function useChainOfThoughtContext() {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error("ChainOfThought components must be used inside <ChainOfThought />.");
  }
  return context;
}

/* ─── Step icon (status + optional kind icon) ────────────────────── */

function StepIcon(args: {
  status?: ChainOfThoughtStep["status"];
  kind?: ChainOfThoughtStep["kind"];
  icon?: ReactNode;
  variant?: "default" | "bullet";
}) {
  /* Bullet variant — small dot for text-only steps. */
  if (args.variant === "bullet") {
    return (
      <span className="flex size-4 items-center justify-center" aria-hidden="true">
        <span
          className={cn(
            "size-1.5 rounded-full",
            args.status === "active" ? "bg-foreground" : "bg-muted-foreground/50",
          )}
        />
      </span>
    );
  }

  /* Active reasoning — pulse the kind icon instead of a generic spinner. */
  if (args.status === "active" && args.kind === "thinking" && args.icon) {
    return (
      <span className="[&>svg]:size-4 text-foreground motion-safe:animate-thinking-shimmer">
        {args.icon}
      </span>
    );
  }

  /* Active state — generic spinner for tools, agents, etc. */
  if (args.status === "active") {
    return <LoaderCircle className="size-4 animate-spin text-foreground" />;
  }

  /* Custom icon with status-driven colour. */
  if (args.icon) {
    return (
      <span
        className={cn(
          "[&>svg]:size-4",
          args.status === "done" ? "text-muted-foreground" : "text-muted-foreground/50",
        )}
      >
        {args.icon}
      </span>
    );
  }

  /* Default status-only fallback. */
  if (args.status === "done") {
    return <Check className="size-4 text-muted-foreground" />;
  }
  return <Circle className="size-4 text-muted-foreground/50" />;
}

/* ─── Root ────────────────────────────────────────────────────────── */

export function ChainOfThought({
  className,
  isStreaming = false,
  defaultOpen = false,
  openWhen = false,
  collapseWhen = false,
  steps,
  summaryItems = [],
  children,
  ...props
}: ChainOfThoughtProps) {
  const [open, setOpen] = useState(defaultOpen);
  const collapseSeenRef = useRef(false);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (openWhen) setOpen(true);
  }, [openWhen]);

  useEffect(() => {
    if (collapseWhen && !collapseSeenRef.current) {
      collapseSeenRef.current = true;
      setOpen(false);
      return;
    }
    if (!collapseWhen) {
      collapseSeenRef.current = false;
    }
  }, [collapseWhen]);

  const contextValue = useMemo(
    () => ({ isStreaming, open, setOpen, summaryItems }),
    [isStreaming, open, summaryItems],
  );

  const resolvedChildren = children ?? (
    <>
      <ChainOfThoughtTrigger />
      <ChainOfThoughtContent>
        {(steps ?? []).map((step) => (
          <ChainOfThoughtStep
            key={step.id}
            title={step.label}
            description={step.detail}
            status={step.status}
            kind={step.kind}
          />
        ))}
      </ChainOfThoughtContent>
    </>
  );

  return (
    <ChainOfThoughtContext.Provider value={contextValue}>
      <div className={cn("not-prose w-full", className)} {...props}>
        {resolvedChildren}
      </div>
    </ChainOfThoughtContext.Provider>
  );
}

/* ─── Trigger ─────────────────────────────────────────────────────── */

export function ChainOfThoughtTrigger(args: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { isStreaming, open, setOpen, summaryItems } = useChainOfThoughtContext();
  const showSummary = !open && !isStreaming && summaryItems.length > 0;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 text-[0.875em] text-muted-foreground transition-colors hover:text-foreground",
          args.className,
        )}
        onClick={() => setOpen(!open)}
        {...args}
      >
        {isStreaming ? (
          <span className="inline-flex items-center gap-2 font-medium motion-safe:animate-thinking-shimmer">
            <Brain className="size-4" />
            Thinking
          </span>
        ) : (
          <>
            <Brain className="size-4" />
            <span className="font-medium">Chain of Thought</span>
          </>
        )}
        <ChevronDown
          className={cn(
            "ml-auto size-4 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </button>

      {/* Collapsed summary — tool/agent/file counts */}
      {showSummary ? (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-6 text-[0.75em] text-muted-foreground/70 motion-safe:animate-cot-step-in">
          {summaryItems.map((item, index) => (
            <span key={item.label} className="inline-flex items-center gap-1">
              {index > 0 ? <span className="text-border" aria-hidden="true">·</span> : null}
              <span className="[&>svg]:size-3">{item.icon}</span>
              <span>{item.count} {item.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Content container ───────────────────────────────────────────── */

export function ChainOfThoughtContent(args: HTMLAttributes<HTMLDivElement>) {
  const { open } = useChainOfThoughtContext();
  if (!open) return null;
  return (
    <div
      className={cn(
        "mt-3 [&>*:last-child_.cot-connector]:hidden",
        "motion-safe:animate-cot-content-in",
        args.className,
      )}
      {...args}
    />
  );
}

/* ─── Step ─────────────────────────────────────────────────────────── */

export function ChainOfThoughtStep({
  title,
  description,
  summary,
  status = "pending",
  kind,
  icon,
  variant = "default",
  defaultOpen = false,
  openWhen = false,
  className,
  children,
  ...props
}: ChainOfThoughtStepProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (openWhen) setOpen(true);
  }, [openWhen]);

  const hasContent = children != null;

  return (
    <div
      className={cn(
        "flex gap-3 text-[0.875em]",
        status === "active" && "text-foreground",
        status === "done" && "text-muted-foreground",
        status === "pending" && "text-muted-foreground/50",
        "motion-safe:animate-cot-step-in",
        className,
      )}
      {...props}
    >
      {/* Icon column with vertical connector */}
      <div className="relative mt-0.5 flex flex-col items-center">
        <StepIcon status={status} kind={kind} icon={icon} variant={variant} />
        <div className="cot-connector mt-1.5 w-px flex-1 bg-border" />
      </div>

      {/* Content column */}
      <div className="min-w-0 flex-1 pb-4">
        {hasContent ? (
          <button
            type="button"
            className="flex items-center gap-1.5 text-left"
            onClick={() => setOpen((prev) => !prev)}
          >
            <span>{title}</span>
            {summary}
            <ChevronDown
              className={cn(
                "size-3 shrink-0 text-muted-foreground/70 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span>{title}</span>
            {summary}
          </div>
        )}

        {description != null ? (
          <div className="mt-1 text-muted-foreground">{description}</div>
        ) : null}

        {hasContent && open ? (
          <div className="mt-2 motion-safe:animate-cot-step-in">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

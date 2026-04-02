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

/* ─── Props ──────────────────────────────────────────────────────── */

interface ChainOfThoughtProps extends HTMLAttributes<HTMLDivElement> {
  isStreaming?: boolean;
  defaultOpen?: boolean;
  openWhen?: boolean;
  collapseWhen?: boolean;
  steps?: ChainOfThoughtStep[];
}

interface ChainOfThoughtStepProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  /** Always-visible description below the title (matches AI Elements API). */
  description?: ReactNode;
  status?: ChainOfThoughtStep["status"];
  kind?: ChainOfThoughtStep["kind"];
  defaultOpen?: boolean;
  openWhen?: boolean;
}

/* ─── Context ────────────────────────────────────────────────────── */

interface ChainOfThoughtContextValue {
  isStreaming: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null);

function useChainOfThoughtContext() {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error("ChainOfThought components must be used inside <ChainOfThought />.");
  }
  return context;
}

/* ─── Step icon (status-only, no kind styling) ───────────────────── */

function StepIcon(args: { status?: ChainOfThoughtStep["status"] }) {
  if (args.status === "active") {
    return <LoaderCircle className="size-4 animate-spin text-foreground" />;
  }
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

  const contextValue = useMemo(() => ({ isStreaming, open, setOpen }), [isStreaming, open]);

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
  const { isStreaming, open, setOpen } = useChainOfThoughtContext();
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
        args.className,
      )}
      onClick={() => setOpen(!open)}
      {...args}
    >
      {isStreaming ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <Brain className="size-4" />
      )}
      <span className="font-medium">
        {isStreaming ? "Thinking" : "Chain of Thought"}
      </span>
      <ChevronDown
        className={cn(
          "ml-auto size-4 transition-transform",
          open ? "rotate-180" : "rotate-0",
        )}
      />
    </button>
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
  status = "pending",
  kind,
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
        "flex gap-3 text-sm",
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
        <StepIcon status={status} />
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
            <ChevronDown
              className={cn(
                "size-3 shrink-0 text-muted-foreground/70 transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        ) : (
          <p>{title}</p>
        )}

        {description != null ? (
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        ) : null}

        {hasContent && open ? (
          <div className="mt-2">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

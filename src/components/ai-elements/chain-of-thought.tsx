import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Brain, CheckCircle2, ChevronDown, Circle, Info, LoaderCircle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChainOfThoughtStep {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "active" | "done";
  kind?: "thinking" | "tool" | "agent" | "system";
}

interface ChainOfThoughtProps extends HTMLAttributes<HTMLDivElement> {
  isStreaming?: boolean;
  defaultOpen?: boolean;
  openWhen?: boolean;
  collapseWhen?: boolean;
  steps?: ChainOfThoughtStep[];
}

interface ChainOfThoughtContextValue {
  isStreaming: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
}

interface ChainOfThoughtStepProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  status?: ChainOfThoughtStep["status"];
  kind?: ChainOfThoughtStep["kind"];
  meta?: ReactNode;
  defaultOpen?: boolean;
  openWhen?: boolean;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue | null>(null);

function useChainOfThoughtContext() {
  const context = useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error("ChainOfThought components must be used inside <ChainOfThought />.");
  }
  return context;
}

function StepIcon(args: { kind?: ChainOfThoughtStep["kind"]; status?: ChainOfThoughtStep["status"] }) {
  if (args.status === "active") {
    return <LoaderCircle className="size-3.5 animate-spin text-primary" />;
  }
  if (args.kind === "thinking") {
    return args.status === "done"
      ? <CheckCircle2 className="size-3.5 text-success" />
      : <Brain className="size-3.5 text-muted-foreground" />;
  }
  if (args.kind === "tool") {
    return args.status === "done"
      ? <CheckCircle2 className="size-3.5 text-success" />
      : <Wrench className="size-3.5 text-muted-foreground" />;
  }
  if (args.kind === "agent") {
    return args.status === "done"
      ? <CheckCircle2 className="size-3.5 text-success" />
      : <Bot className="size-3.5 text-primary" />;
  }
  if (args.kind === "system") {
    return <Info className="size-3.5 text-muted-foreground" />;
  }
  return args.status === "done"
    ? <CheckCircle2 className="size-3.5 text-success" />
    : <Circle className="size-3.5 text-muted-foreground" />;
}

function getStatusLabel(status: ChainOfThoughtStep["status"]) {
  switch (status) {
    case "active":
      return "Running";
    case "done":
      return "Done";
    case "pending":
      return "Pending";
  }
}

function getStatusToneClasses(status: ChainOfThoughtStep["status"]) {
  switch (status) {
    case "active":
      return "border-primary/25 bg-primary/10 text-primary";
    case "done":
      return "border-success/30 bg-success/10 text-success dark:bg-success/15";
    case "pending":
      return "border-border/60 bg-muted/50 text-muted-foreground";
  }
}

function getStepSurfaceToneClasses(args: {
  kind?: ChainOfThoughtStep["kind"];
  status?: ChainOfThoughtStep["status"];
}) {
  const activeTone = args.status === "active" ? "ring-1 ring-primary/10" : "";
  switch (args.kind) {
    case "thinking":
      return cn("border-primary/15 bg-primary/[0.035]", args.status === "active" && "border-primary/25 bg-primary/[0.06]", activeTone);
    case "agent":
      return cn("border-primary/15 bg-primary/[0.03]", activeTone);
    case "tool":
      return cn("border-border/60 bg-background/85", activeTone);
    case "system":
      return cn("border-border/50 bg-muted/10", activeTone);
    default:
      return cn("border-border/60 bg-background/80", activeTone);
  }
}

function getStepIconWrapClasses(args: {
  kind?: ChainOfThoughtStep["kind"];
  status?: ChainOfThoughtStep["status"];
}) {
  if (args.status === "active") {
    return "border-primary/20 bg-primary/10";
  }
  switch (args.kind) {
    case "thinking":
      return "border-primary/15 bg-primary/[0.08]";
    case "agent":
      return "border-primary/15 bg-primary/[0.08]";
    case "tool":
      return "border-border/60 bg-background";
    case "system":
      return "border-border/60 bg-muted/40";
    default:
      return "border-border/60 bg-background";
  }
}

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
    if (openWhen) {
      setOpen(true);
    }
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
    <ChainOfThoughtContent>
      <ol className="space-y-2">
        {(steps ?? []).map((step) => (
          <li
            key={step.id}
            className={cn(
              "flex items-start gap-2.5 rounded-sm",
              "motion-safe:animate-cot-step-in",
            )}
          >
            <div className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border", getStepIconWrapClasses({
              kind: step.kind,
              status: step.status,
            }))}>
              <StepIcon kind={step.kind} status={step.status} />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-foreground">{step.label}</p>
              {step.detail ? <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{step.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </ChainOfThoughtContent>
  );

  return (
    <ChainOfThoughtContext.Provider value={contextValue}>
      <section
        className={cn(
          "overflow-hidden rounded-lg border border-border/70 bg-muted/15 text-sm text-muted-foreground",
          className,
        )}
        {...props}
      >
        {resolvedChildren}
      </section>
    </ChainOfThoughtContext.Provider>
  );
}

export function ChainOfThoughtTrigger(args: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { isStreaming, open, setOpen } = useChainOfThoughtContext();
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground",
        args.className,
      )}
      onClick={() => setOpen(!open)}
      {...args}
    >
      <span className="inline-flex items-center gap-1.5">
        {isStreaming ? <LoaderCircle className="size-3 animate-spin text-primary" /> : <Brain className="size-3 text-muted-foreground" />}
        Chain of Thought
      </span>
      <ChevronDown className={cn("size-3 transition-transform", open ? "rotate-180" : "rotate-0")} />
    </button>
  );
}

export function ChainOfThoughtContent(args: HTMLAttributes<HTMLDivElement>) {
  const { open } = useChainOfThoughtContext();
  if (!open) {
    return null;
  }
  return <div className={cn("border-t border-border/70 px-3 py-2.5", args.className)} {...args} />;
}

export function ChainOfThoughtStep({
  title,
  status = "pending",
  kind,
  meta,
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
    if (openWhen) {
      setOpen(true);
    }
  }, [openWhen]);

  const hasContent = children != null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border shadow-sm",
        getStepSurfaceToneClasses({ kind, status }),
        className,
      )}
      {...props}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
        onClick={() => {
          if (hasContent) {
            setOpen((current) => !current);
          }
        }}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <div className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border", getStepIconWrapClasses({ kind, status }))}>
            <StepIcon kind={kind} status={status} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            {meta ? <div className="mt-1 text-xs text-muted-foreground">{meta}</div> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pl-2">
          <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium", getStatusToneClasses(status))}>
            {getStatusLabel(status)}
          </span>
          {hasContent ? (
            <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open ? "rotate-180" : "rotate-0")} />
          ) : null}
        </div>
      </button>
      {hasContent && open ? (
        <div className="border-t border-border/60 px-3 py-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}

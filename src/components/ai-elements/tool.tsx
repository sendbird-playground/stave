import type { HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { ChevronDown, CircleAlert, CircleCheck, LoaderCircle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolProps extends HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
}

interface ToolHeaderProps extends HTMLAttributes<HTMLButtonElement> {
  type?: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
  title?: string;
}

interface ToolContextValue {
  open: boolean;
  setOpen: (next: boolean) => void;
}

const ToolContext = createContext<ToolContextValue | null>(null);

function useToolContext() {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error("Tool components must be used inside <Tool />.");
  }
  return context;
}

export function Tool({ className, defaultOpen = false, ...props }: ToolProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contextValue = useMemo(() => ({ open, setOpen }), [open]);

  return (
    <ToolContext.Provider value={contextValue}>
      <section className={cn("rounded-md border bg-card", className)} {...props} />
    </ToolContext.Provider>
  );
}

function displayToolName(args: { type?: string; title?: string }) {
  if (args.title?.trim()) {
    return args.title.trim();
  }
  if (!args.type) {
    return "Tool";
  }
  return args.type.replace(/^tool[-_:]?/i, "").replaceAll(/[_-]+/g, " ");
}

export function getStatusBadge(state?: ToolHeaderProps["state"]): ReactNode {
  switch (state) {
    case "input-streaming":
      return (
        <span aria-label="Running" className="inline-flex items-center text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
        </span>
      );
    case "input-available":
      return (
        <span aria-label="Input available" className="inline-flex items-center text-muted-foreground">
          <Wrench className="size-3.5" />
        </span>
      );
    case "output-available":
      return (
        <span aria-label="Done" className="inline-flex items-center text-success">
          <CircleCheck className="size-3.5" />
        </span>
      );
    case "output-error":
      return (
        <span aria-label="Error" className="inline-flex items-center text-destructive">
          <CircleAlert className="size-3.5" />
        </span>
      );
    default:
      return (
        <span aria-label="Idle" className="inline-flex items-center text-muted-foreground">
          <Wrench className="size-3.5" />
        </span>
      );
  }
}

export function ToolHeader({ className, type, state, title, ...props }: ToolHeaderProps) {
  const { open, setOpen } = useToolContext();
  return (
    <button
      type="button"
      className={cn("flex w-full items-center justify-between px-3 py-2 text-sm font-semibold", open && "border-b", className)}
      onClick={() => setOpen(!open)}
      {...props}
    >
      <span className="inline-flex items-center gap-1.5">
        <Wrench className="size-3.5" />
        {displayToolName({ type, title })}
      </span>
      <span className="inline-flex items-center gap-2">
        {getStatusBadge(state)}
        <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : "rotate-0")} />
      </span>
    </button>
  );
}

export function ToolContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { open } = useToolContext();
  if (!open) {
    return null;
  }
  return <div className={cn("space-y-2 px-3 py-2", className)} {...props} />;
}

export function ToolInput(args: { input: unknown; className?: string }) {
  const content = typeof args.input === "string" ? args.input : JSON.stringify(args.input, null, 2);
  return (
    <div className={cn("rounded-sm border border-border/70 bg-muted/20 p-2", args.className)}>
      <p className="mb-1 text-sm uppercase text-muted-foreground">Input</p>
      <pre className="whitespace-pre-wrap text-sm text-muted-foreground">{content}</pre>
    </div>
  );
}

export function ToolOutput(args: { output?: ReactNode; errorText?: string; className?: string }) {
  return (
    <div className={cn("rounded-sm border border-border/70 bg-background/40 p-2", args.className)}>
      <p className="mb-1 text-sm uppercase text-muted-foreground">Output</p>
      {args.errorText ? (
        <p className="whitespace-pre-wrap text-sm text-destructive">{args.errorText}</p>
      ) : (
        <div className="text-sm">{args.output ?? <span className="text-muted-foreground">No output.</span>}</div>
      )}
    </div>
  );
}

type ToolGroupState = "input-streaming" | "input-available" | "output-available" | "output-error";

export function ToolGroup({ states, children }: { states: (ToolGroupState | undefined)[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const latestState = [...states].reverse().find((state): state is ToolGroupState => state !== undefined);

  const overallState: ToolGroupState = latestState ?? "input-available";

  const groupStatus = overallState === "output-available" || overallState === "input-available"
    ? (
      <span aria-label="Done" className="inline-flex items-center text-success">
        <CircleCheck className="size-3.5" />
      </span>
    )
    : overallState === "output-error"
    ? (
      <span aria-label="Error" className="inline-flex items-center text-destructive">
        <CircleAlert className="size-3.5" />
      </span>
    )
    : (
      <span aria-label="Running" className="inline-flex items-center text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" />
      </span>
    );

  return (
    <div className="rounded-md border bg-card">
      <button
        type="button"
        className={cn("flex w-full items-center justify-between px-3 py-2 text-sm font-semibold", open && "border-b")}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="inline-flex items-center gap-1.5">
          <Wrench className="size-3.5" />
          Tools
        </span>
        <span className="inline-flex items-center gap-2">
          {groupStatus}
          <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-180" : "rotate-0")} />
        </span>
      </button>
      {open && <div className="space-y-1 p-2">{children}</div>}
    </div>
  );
}

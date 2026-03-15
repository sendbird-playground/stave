import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReasoningProps extends HTMLAttributes<HTMLDivElement> {
  isStreaming?: boolean;
  defaultOpen?: boolean;
}

interface ReasoningContextValue {
  isStreaming: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
  const context = useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used inside <Reasoning />.");
  }
  return context;
}

export function Reasoning({ className, isStreaming = false, defaultOpen = true, ...props }: ReasoningProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
    } else {
      setOpen(defaultOpen);
    }
  }, [isStreaming, defaultOpen]);

  const contextValue = useMemo(() => ({ isStreaming, open, setOpen }), [isStreaming, open]);

  return (
    <ReasoningContext.Provider value={contextValue}>
      <section
        className={cn(
          "w-full overflow-hidden rounded-md border border-border/80 bg-secondary/30 text-sm text-muted-foreground",
          isStreaming && "min-w-[min(16rem,100%)]",
          className
        )}
        {...props}
      />
    </ReasoningContext.Provider>
  );
}

export function ReasoningTrigger(args: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { isStreaming, open, setOpen } = useReasoningContext();
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground",
        args.className,
      )}
      onClick={() => setOpen(!open)}
      {...args}
    >
      <span className="inline-flex min-w-0 flex-1 items-center gap-2">
        <Brain className="size-4 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            "bg-clip-text leading-none",
            isStreaming
              ? "bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] text-transparent motion-safe:animate-pulse"
              : "text-muted-foreground",
          )}
        >
          {isStreaming ? "Thinking" : "Reasoning"}
        </span>
      </span>
      <ChevronDown className={cn("ml-auto size-3 shrink-0 transition-transform", open ? "rotate-180" : "rotate-0")} />
    </button>
  );
}

export function ReasoningContent(args: HTMLAttributes<HTMLDivElement>) {
  const { open } = useReasoningContext();
  if (!open) {
    return null;
  }
  return <div className={cn("border-t border-border/80 px-3 py-2 whitespace-pre-wrap text-sm leading-relaxed", args.className)} {...args} />;
}

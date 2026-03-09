import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PromptSuggestionsProps = HTMLAttributes<HTMLDivElement>;

export function PromptSuggestions({ className, ...props }: PromptSuggestionsProps) {
  return (
    <div
      className={cn("mb-3 flex flex-wrap gap-2", className)}
      {...props}
    />
  );
}

type PromptSuggestionProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function PromptSuggestion({ className, type = "button", ...props }: PromptSuggestionProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex max-w-full items-center rounded-full border border-border/80 bg-secondary/60 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

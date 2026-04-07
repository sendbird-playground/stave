import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import type { ProviderModePresentation } from "@/lib/providers/provider-mode-presets";
import { cn } from "@/lib/utils";

export type PromptInputProviderModeStatus = ProviderModePresentation & {
  providerLabel: string;
};

function modeToneClass(tone: PromptInputProviderModeStatus["tone"]) {
  if (tone === "accent") {
    return "border-primary/25 bg-primary/10 text-primary hover:bg-primary/14";
  }
  if (tone === "warning") {
    return "border-warning/35 bg-warning/10 text-warning hover:bg-warning/15";
  }
  return "border-border/70 bg-background/55 text-foreground hover:bg-background/80";
}

export function PromptInputProviderModePill(args: {
  status: PromptInputProviderModeStatus;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
            modeToneClass(args.status.tone),
            args.className,
          )}
        >
          <span className="text-muted-foreground">Mode</span>
          <span className="font-medium">{args.status.label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-80 space-y-1.5">
        <p className="font-medium">{args.status.providerLabel} Mode: {args.status.label}</p>
        <p className="text-xs leading-5 text-muted-foreground">{args.status.description}</p>
        <p className="text-xs leading-5 text-muted-foreground">{args.status.detail}</p>
        {args.status.planNote ? (
          <p className="text-xs leading-5 text-muted-foreground">{args.status.planNote}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

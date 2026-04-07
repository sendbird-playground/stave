import { Bot, Check, ChevronDown, Compass, type LucideIcon, Shield, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui";
import type {
  ProviderModePresetDefinition,
  ProviderModePresetId,
  ProviderModePresentation,
} from "@/lib/providers/provider-mode-presets";
import { cn } from "@/lib/utils";

export type PromptInputProviderModeStatus = ProviderModePresentation & {
  providerLabel: string;
};

function modeIconToneClass(status: Pick<PromptInputProviderModeStatus, "id">) {
  if (status.id === "manual") {
    return "border-success/30 bg-success/12 text-success";
  }
  if (status.id === "guided") {
    return "border-primary/20 bg-primary/15 text-primary";
  }
  if (status.id === "auto") {
    return "border-warning/30 bg-warning/15 text-warning";
  }
  return "border-muse/30 bg-muse/12 text-muse";
}

function modeOptionActiveClass(status: Pick<PromptInputProviderModeStatus, "id">) {
  if (status.id === "manual") {
    return "border-success/25 bg-success/10 text-success hover:bg-success/14 hover:text-success";
  }
  if (status.id === "guided") {
    return "border-primary/25 bg-primary/10 text-primary hover:bg-primary/14 hover:text-primary";
  }
  return "border-warning/30 bg-warning/10 text-warning hover:bg-warning/14 hover:text-warning";
}

function modeTriggerIconToneClass(status: Pick<PromptInputProviderModeStatus, "id">) {
  if (status.id === "manual") {
    return "text-prompt-mode-manual";
  }
  if (status.id === "guided") {
    return "text-prompt-mode-guided";
  }
  if (status.id === "auto") {
    return "text-prompt-mode-auto";
  }
  return "text-prompt-mode-custom";
}

function modeVisual(status: PromptInputProviderModeStatus): {
  icon: LucideIcon;
  summary: string;
} {
  if (status.id === "manual") {
    return {
      icon: Shield,
      summary: "Review-first setup",
    };
  }
  if (status.id === "guided") {
    return {
      icon: Compass,
      summary: "Balanced default",
    };
  }
  if (status.id === "auto") {
    return {
      icon: Bot,
      summary: "High autonomy",
    };
  }
  return {
    icon: SlidersHorizontal,
    summary: "Custom setup",
  };
}

export function PromptInputProviderModePill(args: {
  status: PromptInputProviderModeStatus;
  presets: readonly ProviderModePresetDefinition[];
  activePresetId: ProviderModePresetId | null;
  onSelect?: (presetId: ProviderModePresetId) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { icon: Icon } = modeVisual(args.status);
  const isInteractive = args.presets.length > 0 && typeof args.onSelect === "function";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={args.disabled || !isInteractive}
          aria-label={`${args.status.providerLabel} ${args.status.label}: ${args.status.description}`}
          className={cn(
            "h-auto min-h-9 max-w-full justify-start gap-2 rounded-md px-2.5 py-1.5 text-left",
            args.className,
          )}
        >
          <Icon className={cn("size-3.5 shrink-0", modeTriggerIconToneClass(args.status))} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium leading-none">
            {args.status.label}
          </span>
          <ChevronDown className={cn("size-3.5 shrink-0 opacity-70 transition-transform", open && "rotate-180")} />
        </Button>
      </PopoverTrigger>
      {isInteractive ? (
        <PopoverContent align="start" side="top" sideOffset={8} className="w-[22rem] gap-2 p-2">
          <div className="space-y-1">
            {args.presets.map((preset) => {
              const presetStatus = {
                ...args.status,
                id: preset.id,
                label: preset.label,
                description: preset.description,
                planNote: undefined,
              } satisfies PromptInputProviderModeStatus;
              const { icon: PresetIcon, summary: presetSummary } = modeVisual(presetStatus);
              const isActive = args.activePresetId === preset.id;

              return (
                <Button
                  key={preset.id}
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-auto min-h-14 w-full justify-start gap-3 rounded-lg border px-3 py-2.5 text-left whitespace-normal",
                    isActive
                      ? modeOptionActiveClass(presetStatus)
                      : "border-transparent hover:border-border/70 hover:bg-muted/60",
                  )}
                  onClick={() => {
                    args.onSelect?.(preset.id);
                    setOpen(false);
                  }}
                >
                  <span
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-full border",
                      isActive ? modeIconToneClass(presetStatus) : "border-border/70 bg-muted/60 text-muted-foreground",
                    )}
                  >
                    <PresetIcon className="size-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium leading-none">{preset.label}</span>
                    <span className="text-[11px] leading-4 text-muted-foreground">{presetSummary}</span>
                    <span className="text-xs leading-4 text-muted-foreground">{preset.description}</span>
                  </span>
                  {isActive ? <Check className="size-4 shrink-0 text-current" /> : null}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

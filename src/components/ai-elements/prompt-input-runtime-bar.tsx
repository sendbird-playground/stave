import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui";
import { cn } from "@/lib/utils";

export interface PromptInputRuntimeControlOption {
  value: string;
  label: string;
}

export interface PromptInputRuntimeControl {
  id: string;
  label: string;
  value: string;
  options: readonly PromptInputRuntimeControlOption[];
  onSelect: (value: string) => void;
}

export interface PromptInputRuntimeStatusItem {
  id: string;
  label: string;
  value: string;
  tone?: "default" | "warning";
}

interface PromptInputRuntimeBarProps {
  quickControls?: readonly PromptInputRuntimeControl[];
  statusItems?: readonly PromptInputRuntimeStatusItem[];
  disabled?: boolean;
  className?: string;
  withBorder?: boolean;
}

function statusPillToneClass(tone: PromptInputRuntimeStatusItem["tone"]) {
  if (tone === "warning") {
    return "border-warning/40 bg-warning/10 text-warning-foreground";
  }
  return "border-border/70 bg-background/60 text-foreground";
}

function RuntimeStatusPill(args: { label: string; value: string; tone?: PromptInputRuntimeStatusItem["tone"] }) {
  return (
    <div
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs",
        statusPillToneClass(args.tone),
      )}
    >
      <span className="shrink-0 text-muted-foreground">{args.label}</span>
      <span className="truncate font-medium">{args.value}</span>
    </div>
  );
}

function RuntimeControlChip(args: {
  label: string;
  value: string;
  options: readonly PromptInputRuntimeControlOption[];
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  const selectedLabel = args.options.find((option) => option.value === args.value)?.label ?? args.value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={args.disabled}>
        <button
          type="button"
          disabled={args.disabled}
          className={cn(
            "inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/60 px-3 text-xs text-foreground transition-colors hover:bg-background/90",
            args.disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <span className="shrink-0 text-muted-foreground">{args.label}</span>
          <span className="truncate font-medium">{selectedLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-auto min-w-44">
        <DropdownMenuLabel>{args.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={args.value} onValueChange={args.onSelect}>
          {args.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PromptInputRuntimeBar(args: PromptInputRuntimeBarProps) {
  const quickControls = args.quickControls ?? [];
  const statusItems = args.statusItems ?? [];

  if (quickControls.length === 0 && statusItems.length === 0) {
    return null;
  }

  return (
    <div className={cn(args.withBorder !== false && "border-t border-border/70 pt-3", args.className)}>
      {quickControls.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Controls
          </span>
          {quickControls.map((control) => (
            <RuntimeControlChip
              key={control.id}
              label={control.label}
              value={control.value}
              options={control.options}
              disabled={args.disabled}
              onSelect={control.onSelect}
            />
          ))}
        </div>
      ) : null}
      {statusItems.length > 0 ? (
        <div className={cn("flex flex-wrap items-center gap-2", quickControls.length > 0 && "mt-2")}>
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Runtime
          </span>
          {statusItems.map((item) => (
            <RuntimeStatusPill key={item.id} label={item.label} value={item.value} tone={item.tone} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

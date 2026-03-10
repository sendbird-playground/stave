import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getProviderLabel, listProviderIds } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ModelIcon } from "./model-icon";

export interface ModelSelectorOption {
  key: string;
  providerId: ProviderId;
  model: string;
  label: string;
  available: boolean;
}

interface ModelSelectorProps {
  value: ModelSelectorOption;
  options: readonly ModelSelectorOption[];
  disabled?: boolean;
  onSelect: (args: { selection: ModelSelectorOption }) => void;
}

export function ModelSelector(args: ModelSelectorProps) {
  const { value, options, disabled, onSelect } = args;
  const [open, setOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const visibleOptions = useMemo(() => {
    const normalized = filterText.trim().toLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter((item) => item.label.toLowerCase().includes(normalized) || item.model.toLowerCase().includes(normalized));
  }, [filterText, options]);
  const groupedOptions = useMemo(() => {
    const groups: Record<string, ModelSelectorOption[]> = {};
    for (const option of visibleOptions) {
      const bucket = groups[option.providerId] ?? [];
      bucket.push(option);
      groups[option.providerId] = bucket;
    }
    return listProviderIds()
      .map((providerId) => [providerId, groups[providerId] ?? []] as const)
      .filter(([, providerOptions]) => providerOptions.length > 0);
  }, [visibleOptions]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cn(
          "inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-sm border border-border/80 bg-secondary px-2 text-sm text-foreground transition-colors hover:bg-secondary/80",
          open && "border-primary/60 bg-secondary/90",
        )}
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <ModelIcon providerId={value.providerId} className="size-3.5" />
        <span className="truncate">{value.label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute bottom-[calc(100%+0.375rem)] left-0 z-40 w-[20rem] rounded-sm border border-border/90 bg-card p-2 shadow-xl">
          <label className="relative mb-2 block">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder="Search model"
              className="h-8 rounded-sm border-border/80 bg-background pl-7 pr-2 text-sm"
            />
          </label>
          <div className="max-h-56 space-y-1 overflow-auto">
            {groupedOptions.map(([providerId, providerOptions]) => (
              <div key={providerId} className="space-y-1">
                <p className="cmdk-group-heading px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {getProviderLabel({ providerId, variant: "full" })}
                </p>
                {providerOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    disabled={!option.available}
                    className={cn(
                      "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary/70",
                      option.key === value.key && "bg-secondary/80",
                      !option.available && "cursor-not-allowed opacity-50",
                    )}
                    onClick={() => {
                      onSelect({ selection: option });
                      setOpen(false);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ModelIcon providerId={option.providerId} className="size-3.5" />
                      <span className="truncate">{option.label}</span>
                    </span>
                    {option.key === value.key ? <Check className="size-3.5 text-primary" /> : null}
                  </button>
                ))}
              </div>
            ))}
            {visibleOptions.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">No models found.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

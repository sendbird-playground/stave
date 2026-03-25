/**
 * StaveProcessingCard
 *
 * Displays the Stave Pre-processor routing decision inline in a chat message.
 * Shows the selected model + provider icon, strategy, and the Pre-processor's
 * reason, in the style of the AI SDK elements agent component.
 */

import { Zap } from "lucide-react";
import type { StaveProcessingPart } from "@/types/chat";
import { inferProviderIdFromModel, toHumanModelName } from "@/lib/providers/model-catalog";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Component ─────────────────────────────────────────────────────────────────

interface StaveProcessingCardProps {
  part: StaveProcessingPart;
  className?: string;
}

export function StaveProcessingCard({ part, className }: StaveProcessingCardProps) {
  const { strategy, model, supervisorModel, reason, fastMode } = part;
  const displayModel = strategy === "direct" ? model : supervisorModel;
  const providerForModel = displayModel ? inferProviderIdFromModel({ model: displayModel }) : "claude-code";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border border-border/50 bg-muted/25 px-2.5 py-2 text-xs",
        className,
      )}
    >
      {/* Stave logo */}
      <ModelIcon providerId="stave" className="size-3.5 shrink-0 opacity-80" />

      {/* Strategy arrow + model */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {/* Routed-to model */}
        {displayModel ? (
          <>
            <ModelIcon providerId={providerForModel} className="size-3.5 shrink-0" />
            <span className="font-medium text-foreground/80">{toHumanModelName({ model: displayModel })}</span>
          </>
        ) : null}

        {/* Separator */}
        <span className="text-muted-foreground/40 select-none">·</span>

        {/* Reason */}
        <span className="truncate text-muted-foreground">{reason}</span>
      </div>

      {/* Badges: strategy + fast */}
      <div className="flex shrink-0 items-center gap-1">
        {strategy === "orchestrate" ? (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] leading-none">
            orchestrate
          </Badge>
        ) : null}
        {fastMode ? (
          <Badge variant="outline" className="h-4 gap-0.5 px-1.5 text-[10px] leading-none text-amber-600 border-amber-400/50">
            <Zap className="size-2.5" />
            fast
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

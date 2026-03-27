import { Button } from "@/components/ui";
import type { TaskProviderConversationState } from "@/lib/db/workspaces.db";
import type { PersistedTurnRequestSnapshot, PersistedTurnSummary, ReplayedTurnEvent } from "@/lib/db/turns.db";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ReplayEventFilter, SessionOverviewAggregate } from "@/components/session/turn-diagnostics-panel.utils";

export interface TurnReplayHeaderMeta {
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  statusLabel: string | null;
  statusVariant: "destructive" | "secondary" | null;
  totalEvents: number | null;
  previewEventCount: number | null;
  isLatest: boolean;
  isLive: boolean;
  durationLabel: string | null;
  timeAgo: string | null;
  stopReason: string | null;
  lastEventType: string | null;
}

export interface TurnDiagnosticsPanelProps {
  taskId: string;
  workspaceId: string;
  activeTurnId?: string;
  taskProvider: ProviderId;
  providerConversations?: TaskProviderConversationState;
  surface?: "inline" | "drawer";
  defaultOpen?: boolean;
  requestKey?: number;
  requestedView?: DrawerDiagnosticsView;
  requestedReplayFilter?: ReplayEventFilter;
  onHeaderMetaChange?: (meta: TurnReplayHeaderMeta) => void;
}

export interface TurnDiagnosticsState {
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  turns: PersistedTurnSummary[];
  selectedTurnId: string | null;
  replay: ReplayedTurnEvent[];
  requestSnapshot: PersistedTurnRequestSnapshot | null;
}

export interface SessionOverviewState {
  loading: boolean;
  error: string | null;
  aggregate: SessionOverviewAggregate | null;
}

export interface SessionOverviewCacheEntry {
  fingerprint: string;
  replay: ReplayedTurnEvent[];
  requestSnapshot: PersistedTurnRequestSnapshot | null;
}

export type DrawerDiagnosticsView = "overview" | "replay";
export const RECENT_TURN_LIMIT = 12;
export const REPLAY_FILTER_LABELS: Record<ReplayEventFilter, string> = {
  all: "All",
  content: "Content",
  tools: "Tools",
  edits: "Edits",
  approvals: "Approvals",
  system: "System",
  errors: "Errors",
};

export function getStatusBadgeVariant(status: "running" | "completed" | "error" | "truncated" | "interrupted") {
  switch (status) {
    case "error":
      return "destructive";
    case "truncated":
    case "interrupted":
      return "secondary";
    default:
      return "secondary";
  }
}

export function getStatusLabel(status: "running" | "completed" | "error" | "truncated" | "interrupted") {
  switch (status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "error":
      return "Error";
    case "truncated":
      return "Truncated";
    case "interrupted":
      return "Interrupted";
  }
}

export function DiagnosticsViewToggle(args: {
  value: DrawerDiagnosticsView;
  onChange: (value: DrawerDiagnosticsView) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={args.value === "overview" ? "secondary" : "outline"}
        onClick={() => args.onChange("overview")}
      >
        Overview
      </Button>
      <Button
        type="button"
        size="sm"
        variant={args.value === "replay" ? "secondary" : "outline"}
        onClick={() => args.onChange("replay")}
      >
        Replay
      </Button>
    </div>
  );
}

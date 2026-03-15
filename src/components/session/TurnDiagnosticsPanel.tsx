import type { ReactNode } from "react";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronDown, ChevronRight, Clock3, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import type { TaskProviderConversationState } from "@/lib/db/workspaces.db";
import {
  listTaskTurns,
  loadTurnReplay,
  loadTurnRequestSnapshot,
  type PersistedTurnRequestSnapshot,
  type PersistedTurnSummary,
  type ReplayedTurnEvent,
} from "@/lib/db/turns.db";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { getProviderConversationId, getProviderConversationLabel, listProviderConversations } from "@/lib/providers/provider-conversations";
import type { ProviderId } from "@/lib/providers/provider.types";
import { formatTurnDuration, formatTurnEventLabel, summarizeTurnDiagnostics } from "@/lib/providers/turn-diagnostics";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import {
  filterReplayEvents,
  groupReplayEvents,
  getTurnPreviewStatus,
  pickSelectedReplayTurnId,
  summarizeSessionOverview,
  summarizeReplayEventFilters,
  type ReplayEventFilter,
  type SessionOverviewAggregate,
} from "@/components/session/turn-diagnostics-panel.utils";

export interface TurnReplayHeaderMeta {
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  statusLabel: string | null;
  statusVariant: "destructive" | "warning" | "secondary" | null;
  totalEvents: number | null;
  previewEventCount: number | null;
  isLatest: boolean;
  isLive: boolean;
  durationLabel: string | null;
  timeAgo: string | null;
  stopReason: string | null;
  lastEventType: string | null;
}

interface TurnDiagnosticsPanelProps {
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

interface TurnDiagnosticsState {
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
  turns: PersistedTurnSummary[];
  selectedTurnId: string | null;
  replay: ReplayedTurnEvent[];
  requestSnapshot: PersistedTurnRequestSnapshot | null;
}

interface SessionOverviewState {
  loading: boolean;
  error: string | null;
  aggregate: SessionOverviewAggregate | null;
}

interface SessionOverviewCacheEntry {
  fingerprint: string;
  replay: ReplayedTurnEvent[];
  requestSnapshot: PersistedTurnRequestSnapshot | null;
}

type DrawerDiagnosticsView = "overview" | "replay";
const RECENT_TURN_LIMIT = 12;
const REPLAY_FILTER_LABELS: Record<ReplayEventFilter, string> = {
  all: "All",
  content: "Content",
  tools: "Tools",
  edits: "Edits",
  approvals: "Approvals",
  system: "System",
  errors: "Errors",
};

function getStatusBadgeVariant(status: "running" | "completed" | "error" | "truncated" | "interrupted") {
  switch (status) {
    case "error":
      return "destructive";
    case "truncated":
    case "interrupted":
      return "warning";
    default:
      return "secondary";
  }
}

function getStatusLabel(status: "running" | "completed" | "error" | "truncated" | "interrupted") {
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

function DiagnosticsViewToggle(args: {
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

function ReplayEventDetailBlock(args: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-md border border-border/70 bg-background/50 px-3 py-2", args.className)}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{args.label}</p>
      <div className="mt-1 min-w-0 text-sm text-foreground">{args.children}</div>
    </div>
  );
}

function ReplayEventDetail(args: { item: ReplayedTurnEvent }) {
  const { event } = args.item;

  switch (event.type) {
    case "text":
    case "thinking":
      return (
        <ReplayEventDetailBlock label={event.type === "thinking" ? "Reasoning chunk" : "Text chunk"}>
          <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-sans text-sm">{event.text}</pre>
        </ReplayEventDetailBlock>
      );
    case "tool":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant={event.state === "output-error" ? "destructive" : event.state === "input-streaming" ? "warning" : "secondary"}>
              {event.state}
            </Badge>
            {event.toolUseId ? <Badge variant="outline">{event.toolUseId}</Badge> : null}
          </div>
          <ReplayEventDetailBlock label="Tool input">
            <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs">{event.input}</pre>
          </ReplayEventDetailBlock>
          {event.output?.trim() ? (
            <ReplayEventDetailBlock label={event.state === "input-streaming" ? "Live output" : "Tool output"}>
              <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs">{event.output}</pre>
            </ReplayEventDetailBlock>
          ) : null}
        </div>
      );
    case "tool_result":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {event.isError ? <Badge variant="destructive">Error</Badge> : null}
            {event.isPartial ? <Badge variant="warning">Partial</Badge> : null}
            <Badge variant="outline">{event.tool_use_id}</Badge>
          </div>
          <ReplayEventDetailBlock label="Result output">
            <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs">{event.output}</pre>
          </ReplayEventDetailBlock>
        </div>
      );
    case "diff":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{event.filePath}</Badge>
            {event.status ? <Badge variant={event.status === "pending" ? "warning" : "secondary"}>{event.status}</Badge> : null}
          </div>
          <ReplayEventDetailBlock label="Change payload">
            <p>old {event.oldContent.length} chars · new {event.newContent.length} chars</p>
          </ReplayEventDetailBlock>
        </div>
      );
    case "approval":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{event.toolName}</Badge>
            <Badge variant="secondary">{event.requestId}</Badge>
          </div>
          <ReplayEventDetailBlock label="Approval request">
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{event.description}</p>
          </ReplayEventDetailBlock>
        </div>
      );
    case "user_input":
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{event.toolName}</Badge>
            <Badge variant="secondary">{event.requestId}</Badge>
          </div>
          <ReplayEventDetailBlock label="Questions">
            <div className="space-y-2">
              {event.questions.map((question, index) => (
                <div key={`${question.header}-${index}`} className="rounded-sm border border-border/70 bg-card/60 px-2 py-1.5">
                  <p className="font-medium">{question.header}</p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted-foreground">{question.question}</p>
                </div>
              ))}
            </div>
          </ReplayEventDetailBlock>
        </div>
      );
    case "provider_conversation":
      return (
        <ReplayEventDetailBlock label="Provider conversation">
          <p className="font-mono text-xs break-words [overflow-wrap:anywhere]">{event.nativeConversationId}</p>
        </ReplayEventDetailBlock>
      );
    case "usage":
      return (
        <ReplayEventDetailBlock label="Token and cost snapshot">
          <p>
            input {event.inputTokens} · output {event.outputTokens}
            {event.cacheReadTokens != null ? ` · cache read ${event.cacheReadTokens}` : ""}
            {event.cacheCreationTokens != null ? ` · cache write ${event.cacheCreationTokens}` : ""}
            {event.totalCostUsd != null ? ` · $${event.totalCostUsd.toFixed(4)}` : ""}
          </p>
        </ReplayEventDetailBlock>
      );
    case "prompt_suggestions":
      return (
        <ReplayEventDetailBlock label="Prompt suggestions">
          <div className="flex flex-wrap gap-2">
            {event.suggestions.map((suggestion) => (
              <Badge key={suggestion} variant="outline">{suggestion}</Badge>
            ))}
          </div>
        </ReplayEventDetailBlock>
      );
    case "plan_ready":
      return (
        <ReplayEventDetailBlock label="Plan output">
          <pre className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-sans text-sm">{event.planText}</pre>
        </ReplayEventDetailBlock>
      );
    case "system":
      return (
        <ReplayEventDetailBlock label="System notice">
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{event.content}</p>
        </ReplayEventDetailBlock>
      );
    case "error":
      return (
        <ReplayEventDetailBlock label="Error" className="border-destructive/30 bg-destructive/8">
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-destructive">{event.message}</p>
        </ReplayEventDetailBlock>
      );
    case "done":
      return (
        <ReplayEventDetailBlock label="Completion">
          <p>{event.stop_reason ? `stop reason: ${event.stop_reason}` : "Turn completed."}</p>
        </ReplayEventDetailBlock>
      );
  }
}

function ReplayEventCard(args: {
  item: ReplayedTurnEvent;
  timeAnchor: number;
}) {
  const { item, timeAnchor } = args;

  return (
    <div
      key={item.persisted.id}
      className={cn(
        "rounded-md border border-border/70 bg-background/50 px-3 py-3",
        item.event.type === "error" && "border-destructive/30 bg-destructive/6"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{formatTurnEventLabel({ event: item.event })}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            seq {item.persisted.sequence} · {formatTaskUpdatedAt({ value: item.persisted.createdAt, now: timeAnchor })}
          </p>
        </div>
        <Badge variant={item.event.type === "error" ? "destructive" : "outline"} className="shrink-0">
          {item.event.type}
        </Badge>
      </div>
      <div className="mt-3">
        <ReplayEventDetail item={item} />
      </div>
    </div>
  );
}

export function TurnDiagnosticsPanel(args: TurnDiagnosticsPanelProps) {
  const {
    taskId,
    workspaceId,
    activeTurnId,
    taskProvider,
    providerConversations,
    surface = "inline",
    defaultOpen = false,
    requestKey,
    requestedView,
    requestedReplayFilter,
    onHeaderMetaChange,
  } = args;
  const [state, setState] = useState<TurnDiagnosticsState>({
    loading: true,
    detailLoading: false,
    error: null,
    turns: [],
    selectedTurnId: null,
    replay: [],
    requestSnapshot: null,
  });
  const [open, setOpen] = useState(defaultOpen);
  const [drawerView, setDrawerView] = useState<DrawerDiagnosticsView>("overview");
  const [replayFilter, setReplayFilter] = useState<ReplayEventFilter>("all");
  const [collapsedReplayGroups, setCollapsedReplayGroups] = useState<ReplayEventFilter[]>([]);
  const [sessionOverview, setSessionOverview] = useState<SessionOverviewState>({
    loading: false,
    error: null,
    aggregate: null,
  });
  const sessionOverviewCacheRef = useRef<Map<string, SessionOverviewCacheEntry>>(new Map());
  const [timeAnchor, setTimeAnchor] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeAnchor(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (surface !== "drawer" || requestKey == null) {
      return;
    }
    if (requestedView) {
      setDrawerView(requestedView);
    }
    if (requestedReplayFilter) {
      setReplayFilter(requestedReplayFilter);
    }
  }, [requestKey, requestedReplayFilter, requestedView, surface]);

  useEffect(() => {
    let cancelled = false;

    const loadTurns = async () => {
      try {
        const turns = await listTaskTurns({
          workspaceId,
          taskId,
          limit: RECENT_TURN_LIMIT,
        });

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setState((current) => {
            const nextSelectedTurnId = pickSelectedReplayTurnId({
              turns,
              currentSelectedTurnId: current.selectedTurnId,
              activeTurnId,
            });
            const selectionChanged = current.selectedTurnId !== nextSelectedTurnId;
            return {
              ...current,
              loading: false,
              error: null,
              turns,
              selectedTurnId: nextSelectedTurnId,
              detailLoading: selectionChanged ? nextSelectedTurnId !== null : current.detailLoading,
              replay: selectionChanged ? [] : current.replay,
              requestSnapshot: selectionChanged ? null : current.requestSnapshot,
            };
          });
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setState({
            loading: false,
            detailLoading: false,
            error: String(error),
            turns: [],
            selectedTurnId: null,
            replay: [],
            requestSnapshot: null,
          });
        });
      }
    };

    void loadTurns();
    const intervalId = activeTurnId
      ? window.setInterval(() => {
          void loadTurns();
        }, 1000)
      : null;

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [activeTurnId, taskId, workspaceId]);

  const selectedTurn = useMemo(
    () => state.turns.find((turn) => turn.id === state.selectedTurnId) ?? null,
    [state.selectedTurnId, state.turns]
  );
  const selectedTurnCacheFingerprint = useMemo(
    () => (selectedTurn ? `${selectedTurn.completedAt ?? ""}:${selectedTurn.eventCount}` : null),
    [selectedTurn]
  );

  useEffect(() => {
    const selectedTurnId = state.selectedTurnId;
    if (!selectedTurnId) {
      startTransition(() => {
        setState((current) => ({
          ...current,
          detailLoading: false,
          replay: [],
          requestSnapshot: null,
        }));
      });
      return;
    }

    let cancelled = false;

    const loadSelectedTurn = async () => {
      try {
        const [replay, requestSnapshot] = await Promise.all([
          loadTurnReplay({ turnId: selectedTurnId, limit: 400 }),
          loadTurnRequestSnapshot({ turnId: selectedTurnId }),
        ]);

        if (cancelled) {
          return;
        }

        if (selectedTurnCacheFingerprint) {
          sessionOverviewCacheRef.current.set(selectedTurnId, {
            fingerprint: selectedTurnCacheFingerprint,
            replay,
            requestSnapshot,
          });
        }

        startTransition(() => {
          setState((current) => {
            if (current.selectedTurnId !== selectedTurnId) {
              return current;
            }
            return {
              ...current,
              detailLoading: false,
              error: null,
              replay,
              requestSnapshot,
            };
          });
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setState((current) => {
            if (current.selectedTurnId !== selectedTurnId) {
              return current;
            }
            return {
              ...current,
              detailLoading: false,
              error: String(error),
              replay: [],
              requestSnapshot: null,
            };
          });
        });
      }
    };

    void loadSelectedTurn();
    const intervalId = activeTurnId === selectedTurnId
      ? window.setInterval(() => {
          void loadSelectedTurn();
        }, 1000)
      : null;

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [activeTurnId, selectedTurnCacheFingerprint, state.selectedTurnId]);
  const summary = useMemo(
    () => (selectedTurn
      ? summarizeTurnDiagnostics({
          turn: selectedTurn,
          replay: state.replay,
          isActiveTurn: selectedTurn.id === activeTurnId,
        })
      : null),
    [activeTurnId, selectedTurn, state.replay]
  );
  const timeline = useMemo(() => state.replay.slice(-12), [state.replay]);
  const replayEvents = useMemo(() => state.replay.slice(-80), [state.replay]);
  const replayFilterSummary = useMemo(
    () => summarizeReplayEventFilters({ replay: replayEvents }),
    [replayEvents]
  );
  const filteredReplayEvents = useMemo(
    () => filterReplayEvents({ replay: replayEvents, filter: replayFilter }),
    [replayEvents, replayFilter]
  );
  const groupedReplayEvents = useMemo(
    () => groupReplayEvents({ replay: filteredReplayEvents }),
    [filteredReplayEvents]
  );
  const overviewEnabled = open && (surface !== "drawer" || drawerView === "overview");
  const overviewFingerprint = useMemo(
    () => state.turns.map((turn) => `${turn.id}:${turn.completedAt ?? ""}:${turn.eventCount}`).join("|"),
    [state.turns]
  );
  const latestTurnId = state.turns[0]?.id ?? null;
  const selectedTurnIsLatest = selectedTurn?.id === latestTurnId;
  const selectedTurnIsLive = selectedTurn?.id === activeTurnId;
  const selectedTurnPreviewStatus = selectedTurn
    ? getTurnPreviewStatus({ turn: selectedTurn, activeTurnId })
    : null;
  const recentTurnItems = useMemo(
    () => state.turns.map((turn) => {
      const previewStatus = getTurnPreviewStatus({ turn, activeTurnId });
      const previewLabel = [
        formatTaskUpdatedAt({ value: turn.createdAt, now: timeAnchor }),
        getStatusLabel(previewStatus),
        `${turn.eventCount} ${turn.eventCount === 1 ? "event" : "events"}`,
        turn.id === activeTurnId ? "Live" : null,
      ].filter(Boolean).join(" · ");

      return {
        id: turn.id,
        previewStatus,
        previewLabel,
      };
    }),
    [activeTurnId, state.turns, timeAnchor]
  );
  const currentNativeConversationId = useMemo(
    () => getProviderConversationId({ conversations: providerConversations, providerId: taskProvider }),
    [providerConversations, taskProvider]
  );
  const providerConversationRows = useMemo(
    () => listProviderConversations({ conversations: providerConversations }),
    [providerConversations]
  );
  const snapshotConversation = state.requestSnapshot?.conversation ?? null;
  const snapshotTargetProviderLabel = snapshotConversation
    ? getProviderLabel({ providerId: snapshotConversation.target.providerId })
    : null;
  const snapshotPromptPreview = state.requestSnapshot
    ? state.requestSnapshot.prompt.trim() || "(empty fallback prompt; provider runtime used canonical request)"
    : null;

  useEffect(() => {
    const currentTurnIds = new Set(state.turns.map((turn) => turn.id));
    for (const turnId of sessionOverviewCacheRef.current.keys()) {
      if (!currentTurnIds.has(turnId)) {
        sessionOverviewCacheRef.current.delete(turnId);
      }
    }
  }, [overviewFingerprint]);

  useEffect(() => {
    if (!overviewEnabled) {
      return;
    }
    if (state.turns.length === 0) {
      startTransition(() => {
        setSessionOverview({
          loading: false,
          error: null,
          aggregate: null,
        });
      });
      return;
    }

    let cancelled = false;

    startTransition(() => {
      setSessionOverview((current) => ({
        ...current,
        loading: true,
        error: null,
      }));
    });

    const loadSessionOverview = async () => {
      try {
        const bundles = await Promise.all(state.turns.map(async (turn) => {
          const fingerprint = `${turn.completedAt ?? ""}:${turn.eventCount}`;
          const cached = sessionOverviewCacheRef.current.get(turn.id);
          if (cached?.fingerprint === fingerprint) {
            return {
              turn,
              replay: cached.replay,
              requestSnapshot: cached.requestSnapshot,
            };
          }

          const [replay, requestSnapshot] = await Promise.all([
            loadTurnReplay({ turnId: turn.id, limit: 400 }),
            loadTurnRequestSnapshot({ turnId: turn.id }),
          ]);

          sessionOverviewCacheRef.current.set(turn.id, {
            fingerprint,
            replay,
            requestSnapshot,
          });

          return {
            turn,
            replay,
            requestSnapshot,
          };
        }));

        if (cancelled) {
          return;
        }

        const aggregate = summarizeSessionOverview({
          turns: bundles,
          activeTurnId,
        });

        startTransition(() => {
          setSessionOverview({
            loading: false,
            error: null,
            aggregate,
          });
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setSessionOverview((current) => ({
            ...current,
            loading: false,
            error: String(error),
          }));
        });
      }
    };

    void loadSessionOverview();

    return () => {
      cancelled = true;
    };
  }, [activeTurnId, overviewEnabled, overviewFingerprint]);

  useEffect(() => {
    if (!summary) {
      return;
    }
    if (summary.status === "running" || summary.status === "error") {
      setOpen(true);
    }
  }, [summary]);

  useEffect(() => {
    if (!onHeaderMetaChange) {
      return;
    }
    const resolvedStatus = summary?.status ?? selectedTurnPreviewStatus ?? null;
    onHeaderMetaChange({
      loading: state.loading,
      detailLoading: state.detailLoading,
      error: state.error,
      statusLabel: resolvedStatus ? getStatusLabel(resolvedStatus) : null,
      statusVariant: resolvedStatus ? getStatusBadgeVariant(resolvedStatus) : null,
      totalEvents: summary?.totalEvents ?? null,
      previewEventCount: selectedTurn?.eventCount ?? null,
      isLatest: selectedTurnIsLatest,
      isLive: selectedTurnIsLive,
      durationLabel: selectedTurn
        ? formatTurnDuration({ durationMs: summary?.durationMs ?? null, status: summary?.status })
        : null,
      timeAgo: selectedTurn ? formatTaskUpdatedAt({ value: selectedTurn.createdAt, now: timeAnchor }) : null,
      stopReason: summary?.stopReason ?? null,
      lastEventType: summary?.lastEventType ?? null,
    });
  }, [onHeaderMetaChange, state.loading, state.detailLoading, state.error, summary, selectedTurn, selectedTurnIsLatest, selectedTurnIsLive, selectedTurnPreviewStatus, timeAnchor]);

  if (!state.loading && !state.error && !selectedTurn) {
    return null;
  }

  const overviewContent = (
    <>
      <div className="rounded-md border border-border/70 bg-background/50 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recent session</p>
            {sessionOverview.aggregate ? <Badge variant="secondary">{sessionOverview.aggregate.totalTurns} turns</Badge> : null}
            {sessionOverview.loading ? <Badge variant="outline">Refreshing</Badge> : null}
          </div>
          {sessionOverview.aggregate ? (
            <p className="text-xs text-muted-foreground">
              Window: latest {sessionOverview.aggregate.totalTurns} {sessionOverview.aggregate.totalTurns === 1 ? "turn" : "turns"}
            </p>
          ) : null}
        </div>
        {sessionOverview.error ? (
          <p className="mt-2 text-sm text-destructive">{sessionOverview.error}</p>
        ) : null}
        {!sessionOverview.aggregate ? (
          sessionOverview.loading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading recent session overview...</p>
          ) : null
        ) : (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Window</p>
                <p className="mt-1 text-sm text-foreground">
                  running {sessionOverview.aggregate.runningTurns} · completed {sessionOverview.aggregate.completedTurns}
                </p>
              </div>
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Outcomes</p>
                <p className="mt-1 text-sm text-foreground">
                  errors {sessionOverview.aggregate.errorTurns} · truncated {sessionOverview.aggregate.truncatedTurns} · interrupted {sessionOverview.aggregate.interruptedTurns}
                </p>
              </div>
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Activity</p>
                <p className="mt-1 text-sm text-foreground">
                  events {sessionOverview.aggregate.totalEvents} · tools {sessionOverview.aggregate.toolEvents} · approvals {sessionOverview.aggregate.approvalEvents}
                </p>
              </div>
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Changes</p>
                <p className="mt-1 text-sm text-foreground">
                  diffs {sessionOverview.aggregate.diffEvents} · files {sessionOverview.aggregate.filesTouched.length} · input {sessionOverview.aggregate.inputEvents}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Providers</p>
                {sessionOverview.aggregate.providers.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">No providers recorded in this window.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sessionOverview.aggregate.providers.map((providerId) => (
                      <Badge key={providerId} variant="outline">{getProviderLabel({ providerId })}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Models</p>
                {sessionOverview.aggregate.models.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">No request snapshots with model ids in this window.</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {sessionOverview.aggregate.models.map((model) => (
                      <Badge key={model} variant="secondary">{model}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 rounded-md border border-border/70 bg-card/50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recent files</p>
              {sessionOverview.aggregate.filesTouched.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">No diff events in this recent session window.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {sessionOverview.aggregate.filesTouched.slice(0, 8).map((item) => (
                    <Badge key={item.filePath} variant="outline">
                      {item.filePath} x{item.count}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {summary ? (
        <div className="mt-3 flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Selected turn</p>
          {selectedTurn ? <Badge variant="outline">{selectedTurn.id}</Badge> : null}
        </div>
      ) : null}
      {summary ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <div className="rounded-md border border-border/70 bg-background/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Content</p>
            <p className="mt-1 text-sm text-foreground">
              text {summary.textEvents} · reasoning {summary.thinkingEvents}
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-background/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Actions</p>
            <p className="mt-1 text-sm text-foreground">
              tools {summary.toolEvents} · approvals {summary.approvalEvents} · input {summary.inputEvents}
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-background/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Signals</p>
            <p className="mt-1 text-sm text-foreground">
              system {summary.systemEvents} · errors {summary.errorEvents}
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-background/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Native conversation</p>
            <p className="mt-1 truncate font-mono text-sm text-foreground">
              {currentNativeConversationId ?? "Not started"}
            </p>
          </div>
        </div>
      ) : null}
      {summary?.status === "interrupted" ? (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          This turn was interrupted because Stave was closed before the provider finished.
        </div>
      ) : null}
      <div className="mt-3 rounded-md border border-border/70 bg-background/50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Provider sessions</p>
          <Badge variant="secondary">{`Current: ${getProviderLabel({ providerId: taskProvider })}`}</Badge>
        </div>
        {providerConversationRows.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No provider-native ids recorded for this task yet.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {providerConversationRows.map((row) => (
              <div
                key={row.providerId}
                className={cn(
                  "rounded-md border px-2.5 py-2",
                  row.providerId === taskProvider
                    ? "border-border bg-card"
                    : "border-border/70 bg-muted/30"
                )}
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {getProviderConversationLabel({ providerId: row.providerId })}
                </p>
                <p className="mt-1 max-w-[24rem] truncate font-mono text-sm text-foreground">
                  {row.nativeConversationId}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-3 rounded-md border border-border/70 bg-background/50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Request snapshot</p>
          {snapshotTargetProviderLabel ? <Badge variant="outline">{snapshotTargetProviderLabel}</Badge> : null}
          {snapshotConversation?.target.model ? <Badge variant="secondary">{snapshotConversation.target.model}</Badge> : null}
        </div>
        {state.detailLoading && !state.requestSnapshot ? (
          <p className="mt-1 text-sm text-muted-foreground">Loading selected turn...</p>
        ) : null}
        {!state.requestSnapshot ? (
          !state.detailLoading ? <p className="mt-1 text-sm text-muted-foreground">No persisted request snapshot for this turn.</p> : null
        ) : (
          <>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mode</p>
                <p className="mt-1 text-sm text-foreground">{snapshotConversation?.mode ?? "unknown"}</p>
              </div>
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">History</p>
                <p className="mt-1 text-sm text-foreground">{snapshotConversation?.history.length ?? 0} messages</p>
              </div>
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Context parts</p>
                <p className="mt-1 text-sm text-foreground">{snapshotConversation?.contextParts.length ?? 0} parts</p>
              </div>
              <div className="rounded-md border border-border/70 bg-card/50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Resume id</p>
                <p className="mt-1 truncate font-mono text-sm text-foreground">
                  {snapshotConversation?.resume?.nativeConversationId ?? "None"}
                </p>
              </div>
            </div>
            <div className="mt-2 rounded-md border border-border/70 bg-card/50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fallback prompt</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{snapshotPromptPreview}</p>
            </div>
          </>
        )}
      </div>
      <div className="mt-3">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Timeline</p>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border/70 bg-background/50 p-2">
          {state.detailLoading && timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading selected turn...</p>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No persisted events yet.</p>
          ) : (
            timeline.map((item) => (
              <div
                key={item.persisted.id}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-sm px-2 py-1.5 text-sm",
                  item.event.type === "error" && "bg-destructive/10 text-destructive"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{formatTurnEventLabel({ event: item.event })}</p>
                  <p className="text-xs text-muted-foreground">
                    seq {item.persisted.sequence} · {formatTaskUpdatedAt({ value: item.persisted.createdAt, now: timeAnchor })}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {item.event.type}
                </Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );

  const replayContent = (
    <div className="space-y-2">
      <div className="rounded-md border border-border/70 bg-background/50 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Replay filters</p>
          <p className="text-xs text-muted-foreground">
            Showing {filteredReplayEvents.length} of {replayEvents.length} events
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {replayFilterSummary.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={replayFilter === item.id ? "secondary" : "outline"}
              onClick={() => setReplayFilter(item.id)}
            >
              {REPLAY_FILTER_LABELS[item.id]}
              <span className="text-xs tabular-nums text-muted-foreground">{item.count}</span>
            </Button>
          ))}
        </div>
      </div>
      {state.detailLoading && replayEvents.length === 0 ? (
        <div className="rounded-md border border-border/70 bg-background/50 px-3 py-3 text-sm text-muted-foreground">
          Loading selected turn...
        </div>
      ) : replayEvents.length === 0 ? (
        <div className="rounded-md border border-border/70 bg-background/50 px-3 py-3 text-sm text-muted-foreground">
          No persisted replay events yet.
        </div>
      ) : filteredReplayEvents.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/70 bg-background/50 px-3 py-3 text-sm text-muted-foreground">
          No events matched the `{REPLAY_FILTER_LABELS[replayFilter]}` filter for this turn.
        </div>
      ) : replayFilter === "all" ? (
        groupedReplayEvents.map((group) => {
          const isCollapsed = collapsedReplayGroups.includes(group.id);
          return (
            <div key={group.id} className="rounded-md border border-border/70 bg-background/35">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30"
                onClick={() => {
                  setCollapsedReplayGroups((current) => (
                    current.includes(group.id)
                      ? current.filter((value) => value !== group.id)
                      : [...current, group.id]
                  ));
                }}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{REPLAY_FILTER_LABELS[group.id]}</span>
                  <Badge variant="secondary">{group.events.length}</Badge>
                </div>
                {isCollapsed ? (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {!isCollapsed ? (
                <div className="space-y-2 border-t border-border/70 px-3 py-3">
                  {group.events.map((item) => (
                    <ReplayEventCard
                      key={item.persisted.id}
                      item={item}
                      timeAnchor={timeAnchor}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })
      ) : (
        filteredReplayEvents.map((item) => (
          <ReplayEventCard
            key={item.persisted.id}
            item={item}
            timeAnchor={timeAnchor}
          />
        ))
      )}
    </div>
  );

  if (surface === "drawer") {
    return (
      <div className="px-5 py-5 md:px-6">
        <div className="space-y-3">
          <div className="rounded-md border border-border/70 bg-background/50 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Recent turns</p>
              <Badge variant="secondary">{state.turns.length}</Badge>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={state.selectedTurnId ?? undefined}
                onValueChange={(value) => {
                  setState((current) => (
                    current.selectedTurnId === value
                      ? current
                      : {
                          ...current,
                          selectedTurnId: value,
                          detailLoading: true,
                          error: null,
                          replay: [],
                          requestSnapshot: null,
                        }
                  ));
                }}
              >
                <SelectTrigger className="w-full sm:max-w-[28rem]">
                  <SelectValue placeholder="Select a turn" />
                </SelectTrigger>
                <SelectContent>
                  {recentTurnItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.previewLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Showing the most recent {state.turns.length} {state.turns.length === 1 ? "turn" : "turns"} for this task.
              </p>
            </div>
          </div>
          <DiagnosticsViewToggle value={drawerView} onChange={setDrawerView} />
          {drawerView === "overview" ? overviewContent : replayContent}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border/70 px-3 py-2">
      <Card className="overflow-hidden border-border/80 bg-muted/25">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30"
          onClick={() => setOpen((current) => !current)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                {summary?.status === "error" ? <TriangleAlert className="size-4 text-destructive" /> : <Activity className="size-4 text-muted-foreground" />}
                Turn replay
              </span>
              {selectedTurn ? <Badge variant="outline">{getProviderLabel({ providerId: selectedTurn.providerId })}</Badge> : null}
              {summary ? <Badge variant={getStatusBadgeVariant(summary.status)}>{getStatusLabel(summary.status)}</Badge> : null}
              {!summary && selectedTurnPreviewStatus ? <Badge variant={getStatusBadgeVariant(selectedTurnPreviewStatus)}>{getStatusLabel(selectedTurnPreviewStatus)}</Badge> : null}
              {summary ? <Badge variant="secondary">{summary.totalEvents} events</Badge> : selectedTurn ? <Badge variant="secondary">{selectedTurn.eventCount} events</Badge> : null}
              {selectedTurnIsLatest ? <Badge variant="outline">Latest</Badge> : null}
              {selectedTurnIsLive ? <Badge variant="warning">Live</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {state.loading ? <span>Loading session replay...</span> : null}
              {state.detailLoading ? <span>Loading selected turn...</span> : null}
              {state.error ? <span>{state.error}</span> : null}
              {selectedTurn ? (
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3.5" />
                  {formatTurnDuration({
                    durationMs: summary?.durationMs ?? null,
                    status: summary?.status,
                  })}
                </span>
              ) : null}
              {selectedTurn ? <span>{formatTaskUpdatedAt({ value: selectedTurn.createdAt, now: timeAnchor })}</span> : null}
              {summary?.stopReason ? <span>stop: {summary.stopReason}</span> : null}
              {summary?.lastEventType ? <span>last: {summary.lastEventType}</span> : null}
            </div>
          </div>
          {open ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        </button>
        {open ? (
          <div className="border-t border-border/70 bg-card/40 px-3 py-3">
            {overviewContent}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

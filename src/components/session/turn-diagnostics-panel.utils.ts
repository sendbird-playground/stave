import type { PersistedTurnRequestSnapshot, PersistedTurnSummary, ReplayedTurnEvent } from "@/lib/db/turns.db";
import type { ProviderId } from "@/lib/providers/provider.types";
import { summarizeTurnDiagnostics } from "@/lib/providers/turn-diagnostics";

export type TurnPreviewStatus = "running" | "completed" | "interrupted";
export type ReplayEventFilter = "all" | "content" | "tools" | "edits" | "approvals" | "system" | "errors";
const REPLAY_EVENT_FILTER_ORDER: ReplayEventFilter[] = [
  "all",
  "content",
  "tools",
  "edits",
  "approvals",
  "system",
  "errors",
];

export interface ReplayEventFilterSummaryItem {
  id: ReplayEventFilter;
  count: number;
}

export interface ReplayEventGroup {
  id: Exclude<ReplayEventFilter, "all">;
  events: ReplayedTurnEvent[];
}

export interface SessionOverviewTurnBundle {
  turn: PersistedTurnSummary;
  replay: ReplayedTurnEvent[];
  requestSnapshot: PersistedTurnRequestSnapshot | null;
}

export interface SessionOverviewAggregate {
  totalTurns: number;
  totalEvents: number;
  runningTurns: number;
  completedTurns: number;
  interruptedTurns: number;
  truncatedTurns: number;
  errorTurns: number;
  toolEvents: number;
  approvalEvents: number;
  inputEvents: number;
  diffEvents: number;
  errorEvents: number;
  filesTouched: Array<{ filePath: string; count: number }>;
  providers: ProviderId[];
  models: string[];
}

export function getTurnPreviewStatus(args: {
  turn: PersistedTurnSummary;
  activeTurnId?: string;
}): TurnPreviewStatus {
  if (args.turn.id === args.activeTurnId) {
    return "running";
  }
  return args.turn.completedAt ? "completed" : "interrupted";
}

export function pickSelectedReplayTurnId(args: {
  turns: PersistedTurnSummary[];
  currentSelectedTurnId?: string | null;
  activeTurnId?: string;
}): string | null {
  if (args.currentSelectedTurnId && args.turns.some((turn) => turn.id === args.currentSelectedTurnId)) {
    return args.currentSelectedTurnId;
  }
  if (args.activeTurnId && args.turns.some((turn) => turn.id === args.activeTurnId)) {
    return args.activeTurnId;
  }
  return args.turns[0]?.id ?? null;
}

export function getReplayEventFilterId(args: { item: ReplayedTurnEvent }): Exclude<ReplayEventFilter, "all"> {
  switch (args.item.event.type) {
    case "text":
    case "thinking":
      return "content";
    case "tool":
    case "tool_progress":
    case "tool_result":
      return "tools";
    case "diff":
      return "edits";
    case "approval":
    case "user_input":
      return "approvals";
    case "error":
      return "errors";
    case "provider_conversation":
    case "usage":
    case "prompt_suggestions":
    case "plan_ready":
    case "model_resolved":
    case "stave:execution_processing":
    case "stave:orchestration_processing":
    case "stave:subtask_started":
    case "stave:subtask_done":
    case "stave:synthesis_started":
    case "subagent_progress":
    case "system":
    case "done":
      return "system";
  }

  const exhaustiveCheck: never = args.item.event;
  return exhaustiveCheck;
}

export function summarizeReplayEventFilters(args: {
  replay: ReplayedTurnEvent[];
}): ReplayEventFilterSummaryItem[] {
  const counts = new Map<ReplayEventFilter, number>(
    REPLAY_EVENT_FILTER_ORDER.map((id) => [id, id === "all" ? args.replay.length : 0])
  );

  for (const item of args.replay) {
    const filterId = getReplayEventFilterId({ item });
    counts.set(filterId, (counts.get(filterId) ?? 0) + 1);
  }

  return REPLAY_EVENT_FILTER_ORDER.map((id) => ({
    id,
    count: counts.get(id) ?? 0,
  }));
}

export function filterReplayEvents(args: {
  replay: ReplayedTurnEvent[];
  filter: ReplayEventFilter;
}): ReplayedTurnEvent[] {
  if (args.filter === "all") {
    return args.replay;
  }
  return args.replay.filter((item) => getReplayEventFilterId({ item }) === args.filter);
}

export function groupReplayEvents(args: {
  replay: ReplayedTurnEvent[];
}): ReplayEventGroup[] {
  const groups = new Map<Exclude<ReplayEventFilter, "all">, ReplayedTurnEvent[]>();
  for (const id of REPLAY_EVENT_FILTER_ORDER) {
    if (id === "all") {
      continue;
    }
    groups.set(id, []);
  }

  for (const item of args.replay) {
    const filterId = getReplayEventFilterId({ item });
    const current = groups.get(filterId);
    if (!current) {
      continue;
    }
    current.push(item);
  }

  return REPLAY_EVENT_FILTER_ORDER
    .filter((id): id is Exclude<ReplayEventFilter, "all"> => id !== "all")
    .map((id) => ({
      id,
      events: groups.get(id) ?? [],
    }))
    .filter((group) => group.events.length > 0);
}

export function formatRequestSnapshotPromptPreview(args: {
  requestSnapshot: PersistedTurnRequestSnapshot | null | undefined;
}) {
  const requestSnapshot = args.requestSnapshot;
  if (!requestSnapshot) {
    return null;
  }

  const prompt = requestSnapshot.prompt.trim();
  if (prompt) {
    return prompt;
  }

  const skillPart = requestSnapshot.conversation?.contextParts.find(
    (part): part is Extract<NonNullable<PersistedTurnRequestSnapshot["conversation"]>["contextParts"][number], { type: "skill_context" }> =>
      part.type === "skill_context",
  );

  if (skillPart && skillPart.skills.length > 0) {
    const skillLabels = skillPart.skills.map((skill) => skill.invocationToken || `$${skill.slug}`);
    return `(skill-only input; selected skills: ${skillLabels.join(", ")})`;
  }

  return "(empty fallback prompt; provider runtime used canonical request)";
}

export function summarizeSessionOverview(args: {
  turns: SessionOverviewTurnBundle[];
  activeTurnId?: string;
}): SessionOverviewAggregate {
  let runningTurns = 0;
  let completedTurns = 0;
  let interruptedTurns = 0;
  let truncatedTurns = 0;
  let errorTurns = 0;
  let toolEvents = 0;
  let approvalEvents = 0;
  let inputEvents = 0;
  let diffEvents = 0;
  let errorEvents = 0;

  const providers = new Set<ProviderId>();
  const models = new Set<string>();
  const fileCounts = new Map<string, number>();

  for (const item of args.turns) {
    providers.add(item.turn.providerId);
    const model = item.requestSnapshot?.conversation?.target.model?.trim();
    if (model) {
      models.add(model);
    }

    const status = summarizeTurnDiagnostics({
      turn: item.turn,
      replay: item.replay,
      isActiveTurn: item.turn.id === args.activeTurnId,
    }).status;

    switch (status) {
      case "running":
        runningTurns += 1;
        break;
      case "completed":
        completedTurns += 1;
        break;
      case "interrupted":
        interruptedTurns += 1;
        break;
      case "truncated":
        truncatedTurns += 1;
        break;
      case "error":
        errorTurns += 1;
        break;
    }

    for (const replayItem of item.replay) {
      switch (replayItem.event.type) {
        case "tool":
        case "tool_result":
          toolEvents += 1;
          break;
        case "approval":
          approvalEvents += 1;
          break;
        case "user_input":
          inputEvents += 1;
          break;
        case "diff":
          diffEvents += 1;
          fileCounts.set(
            replayItem.event.filePath,
            (fileCounts.get(replayItem.event.filePath) ?? 0) + 1,
          );
          break;
        case "error":
          errorEvents += 1;
          break;
        default:
          break;
      }
    }
  }

  return {
    totalTurns: args.turns.length,
    totalEvents: args.turns.reduce((sum, item) => sum + item.turn.eventCount, 0),
    runningTurns,
    completedTurns,
    interruptedTurns,
    truncatedTurns,
    errorTurns,
    toolEvents,
    approvalEvents,
    inputEvents,
    diffEvents,
    errorEvents,
    filesTouched: [...fileCounts.entries()]
      .map(([filePath, count]) => ({ filePath, count }))
      .sort((left, right) => right.count - left.count || left.filePath.localeCompare(right.filePath)),
    providers: [...providers].sort((left, right) => left.localeCompare(right)),
    models: [...models].sort((left, right) => left.localeCompare(right)),
  };
}

import { z } from "zod";
import { parseNormalizedEvent } from "@/lib/providers/runtime";
import type { CanonicalConversationRequest } from "@/lib/providers/provider.types";
import type { ParsedNormalizedProviderEvent } from "@/lib/providers/schemas";

const PersistedTurnSummarySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  taskId: z.string(),
  providerId: z.union([z.literal("claude-code"), z.literal("codex"), z.literal("stave")]),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  eventCount: z.number().int().nonnegative(),
});

const PersistedTurnEventSchema = z.object({
  id: z.string(),
  turnId: z.string(),
  sequence: z.number().int().nonnegative(),
  eventType: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
});

export type PersistedTurnSummary = z.infer<typeof PersistedTurnSummarySchema>;
export type PersistedTurnEvent = z.infer<typeof PersistedTurnEventSchema>;

const PersistedTurnRequestSnapshotSchema = z.object({
  type: z.literal("request_snapshot"),
  prompt: z.string(),
  conversation: z.unknown().nullable().optional(),
});

export interface PersistedTurnRequestSnapshot {
  type: "request_snapshot";
  prompt: string;
  conversation?: CanonicalConversationRequest | null;
}

export interface ReplayedTurnEvent {
  persisted: PersistedTurnEvent;
  event: ParsedNormalizedProviderEvent;
}

function getPersistenceApi() {
  return window.api?.persistence;
}

function parseReplayEvents(args: { events: PersistedTurnEvent[] }) {
  const replay: ReplayedTurnEvent[] = [];

  for (const persisted of args.events) {
    if (persisted.eventType === "request_snapshot") {
      continue;
    }
    const parsed = parseNormalizedEvent({ payload: persisted.payload });
    if (!parsed) {
      continue;
    }
    replay.push({ persisted, event: parsed });
  }

  return replay;
}

export async function listTaskTurns(args: {
  workspaceId: string;
  taskId: string;
  limit?: number;
}): Promise<PersistedTurnSummary[]> {
  const persistence = getPersistenceApi();
  if (!persistence?.listTaskTurns) {
    return [];
  }

  const response = await persistence.listTaskTurns({
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    limit: args.limit,
  });
  if (!response.ok) {
    throw new Error(`Failed to list task turns for ${args.taskId}`);
  }

  const parsed = z.array(PersistedTurnSummarySchema).safeParse(response.turns);
  if (!parsed.success) {
    throw new Error("Invalid task turn payload returned from persistence bridge.");
  }

  return parsed.data;
}

export async function listLatestWorkspaceTurns(args: {
  workspaceId: string;
  limit?: number;
}): Promise<PersistedTurnSummary[]> {
  const persistence = getPersistenceApi();
  if (!persistence?.listLatestWorkspaceTurns) {
    return [];
  }

  const response = await persistence.listLatestWorkspaceTurns({
    workspaceId: args.workspaceId,
    limit: args.limit,
  });
  if (!response.ok) {
    throw new Error(`Failed to list latest workspace turns for ${args.workspaceId}`);
  }

  const parsed = z.array(PersistedTurnSummarySchema).safeParse(response.turns);
  if (!parsed.success) {
    throw new Error("Invalid latest workspace turn payload returned from persistence bridge.");
  }

  return parsed.data;
}

export async function listActiveWorkspaceTurns(args: {
  workspaceId: string;
  limit?: number;
}): Promise<PersistedTurnSummary[]> {
  const persistence = getPersistenceApi();
  if (!persistence) {
    return [];
  }

  if (!persistence.listActiveWorkspaceTurns) {
    const latestTurns = await listLatestWorkspaceTurns(args);
    return latestTurns.filter((turn) => !turn.completedAt);
  }

  const response = await persistence.listActiveWorkspaceTurns({
    workspaceId: args.workspaceId,
    limit: args.limit,
  });
  if (!response.ok) {
    throw new Error(`Failed to list active workspace turns for ${args.workspaceId}`);
  }

  const parsed = z.array(PersistedTurnSummarySchema).safeParse(response.turns);
  if (!parsed.success) {
    throw new Error("Invalid active workspace turn payload returned from persistence bridge.");
  }

  return parsed.data;
}

export async function listPersistedTurnEvents(args: {
  turnId: string;
  afterSequence?: number;
  limit?: number;
}): Promise<PersistedTurnEvent[]> {
  const persistence = getPersistenceApi();
  if (!persistence?.listTurnEvents) {
    return [];
  }

  const response = await persistence.listTurnEvents({
    turnId: args.turnId,
    afterSequence: args.afterSequence,
    limit: args.limit,
  });
  if (!response.ok) {
    throw new Error(`Failed to list turn events for ${args.turnId}`);
  }

  const parsed = z.array(PersistedTurnEventSchema).safeParse(response.events);
  if (!parsed.success) {
    throw new Error("Invalid turn event payload returned from persistence bridge.");
  }

  return parsed.data;
}

export async function loadTurnReplay(args: {
  turnId: string;
  afterSequence?: number;
  limit?: number;
}): Promise<ReplayedTurnEvent[]> {
  const events = await listPersistedTurnEvents(args);
  return parseReplayEvents({ events });
}

export async function loadTurnRequestSnapshot(args: {
  turnId: string;
}): Promise<PersistedTurnRequestSnapshot | null> {
  const events = await listPersistedTurnEvents({
    turnId: args.turnId,
    afterSequence: 0,
    limit: 10,
  });
  const rawSnapshot = events.find((event) => event.eventType === "request_snapshot")?.payload;
  if (!rawSnapshot) {
    return null;
  }

  const parsed = PersistedTurnRequestSnapshotSchema.safeParse(rawSnapshot);
  if (!parsed.success) {
    return null;
  }

  return {
    type: "request_snapshot",
    prompt: parsed.data.prompt,
    conversation: (parsed.data.conversation as CanonicalConversationRequest | null | undefined) ?? null,
  };
}

export async function* replayPersistedTurn(args: {
  turnId: string;
  afterSequence?: number;
  limit?: number;
  delayMs?: number;
}): AsyncGenerator<ReplayedTurnEvent, void, unknown> {
  const replay = await loadTurnReplay(args);

  for (const item of replay) {
    if ((args.delayMs ?? 0) > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, args.delayMs));
    }
    yield item;
  }
}

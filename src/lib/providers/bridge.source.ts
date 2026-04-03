import type { ProviderEventSource, ProviderId, ProviderTurnRequest } from "@/lib/providers/provider.types";

type PushStreamPayload = {
  streamId: string;
  event: unknown;
  sequence?: number;
  done: boolean;
};

function hasAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Symbol.asyncIterator in value;
}

async function* fromArray(args: { items: unknown[] }) {
  for (const item of args.items) {
    yield item;
  }
}

async function* emitStartFailure(args: { message?: string }) {
  const detail = args.message?.trim() || "Provider request could not start.";
  yield {
    type: "system",
    content: detail,
  };
  yield {
    type: "done",
  };
}

async function* fromPolledStream(args: {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: ProviderTurnRequest["conversation"];
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
}) {
  const startStreamTurn = window.api?.provider?.startStreamTurn;
  const readStreamTurn = window.api?.provider?.readStreamTurn;
  if (!startStreamTurn || !readStreamTurn) {
    return;
  }

  const started = await startStreamTurn({
    turnId: args.turnId,
    providerId: args.providerId,
    prompt: args.prompt,
    conversation: args.conversation,
    taskId: args.taskId,
    workspaceId: args.workspaceId,
    cwd: args.cwd,
    runtimeOptions: args.runtimeOptions,
  });
  if (!started.ok || !started.streamId) {
    yield* emitStartFailure({ message: started.message });
    return;
  }

  let cursor = 0;
  for (;;) {
    const page = await readStreamTurn({ streamId: started.streamId, cursor });
    if (!page.ok) {
      yield* emitStartFailure({ message: page.message });
      return;
    }
    for (const event of page.events) {
      yield event;
    }
    cursor = page.cursor;
    if (page.done) {
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
}

async function* fromPushStream(args: {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: ProviderTurnRequest["conversation"];
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
}) {
  const startPushTurn = window.api?.provider?.startPushTurn;
  const subscribeStreamEvents = window.api?.provider?.subscribeStreamEvents;
  if (!startPushTurn || !subscribeStreamEvents) {
    return;
  }

  const queue: unknown[] = [];
  const pending: PushStreamPayload[] = [];
  const bufferedBySequence = new Map<number, PushStreamPayload>();
  let done = false;
  let targetStreamId: string | null = null;
  let nextSequence = 1;
  let doneSequence: number | null = null;
  let wake: (() => void) | null = null;
  const wakeUp = () => {
    if (!wake) {
      return;
    }
    const resolver = wake;
    wake = null;
    resolver();
  };

  const ingestPayload = (payload: PushStreamPayload) => {
    const sequence = payload.sequence;
    if (typeof sequence !== "number" || !Number.isFinite(sequence)) {
      queue.push(payload.event);
      if (payload.done) {
        done = true;
      }
      wakeUp();
      return;
    }

    if (sequence < nextSequence || bufferedBySequence.has(sequence)) {
      return;
    }

    bufferedBySequence.set(sequence, payload);
    if (payload.done) {
      doneSequence = sequence;
    }

    while (bufferedBySequence.has(nextSequence)) {
      const nextPayload = bufferedBySequence.get(nextSequence)!;
      bufferedBySequence.delete(nextSequence);
      queue.push(nextPayload.event);
      nextSequence += 1;
    }

    if (doneSequence !== null && nextSequence > doneSequence) {
      done = true;
    }
    wakeUp();
  };

  const unsubscribe = subscribeStreamEvents((payload) => {
    if (!targetStreamId) {
      pending.push(payload);
      return;
    }
    if (payload.streamId !== targetStreamId) {
      return;
    }
    ingestPayload(payload);
  });

  try {
    const started = await startPushTurn({
      turnId: args.turnId,
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: args.conversation,
      taskId: args.taskId,
      workspaceId: args.workspaceId,
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
    });
    if (!started.ok || !started.streamId) {
      yield* emitStartFailure({ message: started.message });
      return;
    }
    targetStreamId = started.streamId;

    for (const item of pending) {
      if (item.streamId !== targetStreamId) {
        continue;
      }
      ingestPayload(item);
    }
    pending.length = 0;
    wakeUp();

    while (!done || queue.length > 0) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      const next = queue.shift();
      if (typeof next !== "undefined") {
        yield next;
      }
    }
  } finally {
    unsubscribe();
  }
}

async function resolveBridgeStream(args: {
  turnId?: string;
  providerId: ProviderId;
  prompt: string;
  conversation?: ProviderTurnRequest["conversation"];
  taskId?: string;
  workspaceId?: string;
  cwd?: string;
  runtimeOptions?: ProviderTurnRequest["runtimeOptions"];
}): Promise<unknown[] | AsyncIterable<unknown> | null> {
  if (args.runtimeOptions?.chatStreamingEnabled === false) {
    const streamTurn = window.api?.provider?.streamTurn;
    if (!streamTurn) {
      return null;
    }
    const result = await streamTurn({
      turnId: args.turnId,
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: args.conversation,
      taskId: args.taskId,
      workspaceId: args.workspaceId,
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
    });

    if (Array.isArray(result) || hasAsyncIterable(result)) {
      return result;
    }

    return null;
  }

  const startPushTurn = window.api?.provider?.startPushTurn;
  const subscribeStreamEvents = window.api?.provider?.subscribeStreamEvents;
  if (startPushTurn && subscribeStreamEvents) {
    return fromPushStream({
      turnId: args.turnId,
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: args.conversation,
      taskId: args.taskId,
      workspaceId: args.workspaceId,
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
    });
  }

  const startStreamTurn = window.api?.provider?.startStreamTurn;
  const readStreamTurn = window.api?.provider?.readStreamTurn;
  if (startStreamTurn && readStreamTurn) {
    return fromPolledStream({
      turnId: args.turnId,
      providerId: args.providerId,
      prompt: args.prompt,
      conversation: args.conversation,
      taskId: args.taskId,
      workspaceId: args.workspaceId,
      cwd: args.cwd,
      runtimeOptions: args.runtimeOptions,
    });
  }

  const streamTurn = window.api?.provider?.streamTurn;
  if (!streamTurn) {
    return null;
  }

  const result = await streamTurn({
    turnId: args.turnId,
    providerId: args.providerId,
    prompt: args.prompt,
    conversation: args.conversation,
    taskId: args.taskId,
    workspaceId: args.workspaceId,
    cwd: args.cwd,
    runtimeOptions: args.runtimeOptions,
  });

  if (Array.isArray(result)) {
    return result;
  }

  if (hasAsyncIterable(result)) {
    return result;
  }

  return null;
}

export function hasBridgeProviderSource() {
  if (typeof window === "undefined") {
    return false;
  }
  return typeof window.api?.provider?.startPushTurn === "function"
    || typeof window.api?.provider?.startStreamTurn === "function"
    || typeof window.api?.provider?.streamTurn === "function";
}

export function createBridgeProviderSource<TRawEvent>(args: { providerId: ProviderId }): ProviderEventSource<TRawEvent> {
  const { providerId } = args;

  return {
    async *streamTurn(turnArgs: ProviderTurnRequest) {
      const source = await resolveBridgeStream({
        turnId: turnArgs.turnId,
        providerId,
        prompt: turnArgs.prompt,
        conversation: turnArgs.conversation,
        taskId: turnArgs.taskId,
        workspaceId: turnArgs.workspaceId,
        cwd: turnArgs.cwd,
        runtimeOptions: turnArgs.runtimeOptions,
      });

      if (!source) {
        return;
      }

      if (Array.isArray(source)) {
        for await (const item of fromArray({ items: source })) {
          yield item as TRawEvent;
        }
        return;
      }

      for await (const item of source) {
        yield item as TRawEvent;
      }
    },
  };
}

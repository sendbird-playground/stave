import type { BridgeEvent } from "./types";
import {
  byteLengthUtf8,
  takeUtf8PrefixByBytes,
  takeUtf8SuffixByBytes,
  truncateUtf8Middle,
} from "../shared/bounded-text";

export function measureBridgeEventBytes(event: BridgeEvent) {
  return byteLengthUtf8(JSON.stringify(event));
}

export function appendBoundedText(args: {
  current: string;
  chunk: string;
  maxBytes: number;
  keep: "prefix" | "suffix";
}) {
  const combined = `${args.current}${args.chunk}`;
  if (byteLengthUtf8(combined) <= args.maxBytes) {
    return combined;
  }
  if (args.keep === "prefix") {
    return takeUtf8PrefixByBytes({
      value: combined,
      maxBytes: args.maxBytes,
    }).prefix;
  }
  return takeUtf8SuffixByBytes({
    value: combined,
    maxBytes: args.maxBytes,
  }).suffix;
}

export function truncateBufferedText(args: {
  value: string;
  maxBytes: number;
}) {
  return truncateUtf8Middle({
    value: args.value,
    maxBytes: args.maxBytes,
  });
}

export function shouldReplaceBufferedBridgeEvent(args: {
  previous?: BridgeEvent;
  next: BridgeEvent;
}) {
  const previous = args.previous;
  const next = args.next;
  if (!previous) {
    return false;
  }
  if (
    next.type === "tool_result"
    && next.isPartial
    && previous.type === "tool_result"
    && previous.isPartial
    && previous.tool_use_id === next.tool_use_id
  ) {
    return true;
  }
  if (next.type === "plan_ready" && previous.type === "plan_ready") {
    return (previous.sourceSegmentId ?? "") === (next.sourceSegmentId ?? "");
  }
  return false;
}

export function appendBoundedBridgeEvent(args: {
  events: BridgeEvent[];
  next: BridgeEvent;
  retainedBytes: number;
  maxBytes: number;
}) {
  let retainedBytes = args.retainedBytes;
  const previous = args.events.at(-1);
  if (shouldReplaceBufferedBridgeEvent({ previous, next: args.next })) {
    retainedBytes -= previous ? measureBridgeEventBytes(previous) : 0;
    args.events[args.events.length - 1] = args.next;
    retainedBytes += measureBridgeEventBytes(args.next);
  } else {
    args.events.push(args.next);
    retainedBytes += measureBridgeEventBytes(args.next);
  }

  let droppedCount = 0;
  while (retainedBytes > args.maxBytes && args.events.length > 0) {
    const removed = args.events.shift();
    if (!removed) {
      break;
    }
    retainedBytes -= measureBridgeEventBytes(removed);
    droppedCount += 1;
  }

  return {
    retainedBytes,
    droppedCount,
  };
}

export function dropBufferedBridgeEvents(args: {
  events: BridgeEvent[];
  retainedBytes: number;
  dropCount: number;
}) {
  let retainedBytes = args.retainedBytes;
  if (args.dropCount <= 0) {
    return retainedBytes;
  }
  const removed = args.events.splice(0, args.dropCount);
  for (const event of removed) {
    retainedBytes -= measureBridgeEventBytes(event);
  }
  return retainedBytes;
}

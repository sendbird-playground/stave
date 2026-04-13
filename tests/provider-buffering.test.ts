import { describe, expect, test } from "bun:test";
import {
  appendBoundedBridgeEvent,
  appendBoundedText,
  dropBufferedBridgeEvents,
  measureBridgeEventBytes,
} from "../electron/providers/provider-buffering";
import type { BridgeEvent } from "../electron/providers/types";

describe("appendBoundedText", () => {
  test("keeps the suffix when requested", () => {
    expect(appendBoundedText({
      current: "abcdef",
      chunk: "ghijkl",
      keep: "suffix",
      maxBytes: 6,
    })).toBe("ghijkl");
  });

  test("keeps the prefix when requested", () => {
    expect(appendBoundedText({
      current: "abcdef",
      chunk: "ghijkl",
      keep: "prefix",
      maxBytes: 6,
    })).toBe("abcdef");
  });
});

describe("appendBoundedBridgeEvent", () => {
  test("replaces superseded partial tool snapshots for the same tool", () => {
    const events: BridgeEvent[] = [];
    let retainedBytes = 0;

    retainedBytes = appendBoundedBridgeEvent({
      events,
      next: {
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "running 1",
        isPartial: true,
      },
      retainedBytes,
      maxBytes: 1024,
    }).retainedBytes;

    retainedBytes = appendBoundedBridgeEvent({
      events,
      next: {
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "running 2",
        isPartial: true,
      },
      retainedBytes,
      maxBytes: 1024,
    }).retainedBytes;

    expect(retainedBytes).toBeGreaterThan(0);
    expect(events).toEqual([
      {
        type: "tool_result",
        tool_use_id: "tool-1",
        output: "running 2",
        isPartial: true,
      },
    ]);
  });

  test("replaces superseded plan snapshots for the same source segment", () => {
    const events: BridgeEvent[] = [];
    let retainedBytes = 0;

    retainedBytes = appendBoundedBridgeEvent({
      events,
      next: {
        type: "plan_ready",
        planText: "Step 1",
        sourceSegmentId: "plan-1",
      },
      retainedBytes,
      maxBytes: 1024,
    }).retainedBytes;

    retainedBytes = appendBoundedBridgeEvent({
      events,
      next: {
        type: "plan_ready",
        planText: "Step 1\nStep 2",
        sourceSegmentId: "plan-1",
      },
      retainedBytes,
      maxBytes: 1024,
    }).retainedBytes;

    expect(retainedBytes).toBeGreaterThan(0);
    expect(events).toEqual([
      {
        type: "plan_ready",
        planText: "Step 1\nStep 2",
        sourceSegmentId: "plan-1",
      },
    ]);
  });

  test("drops the oldest retained events when the replay window exceeds its byte cap", () => {
    const first: BridgeEvent = { type: "text", text: "alpha" };
    const second: BridgeEvent = { type: "text", text: "beta" };
    const maxBytes = measureBridgeEventBytes(first) + measureBridgeEventBytes(second) - 1;
    const events: BridgeEvent[] = [];
    let retainedBytes = 0;

    retainedBytes = appendBoundedBridgeEvent({
      events,
      next: first,
      retainedBytes,
      maxBytes,
    }).retainedBytes;

    const appended = appendBoundedBridgeEvent({
      events,
      next: second,
      retainedBytes,
      maxBytes,
    });

    expect(appended.droppedCount).toBe(1);
    expect(events).toEqual([second]);
  });
});

describe("dropBufferedBridgeEvents", () => {
  test("removes acknowledged events and updates the retained byte count", () => {
    const first: BridgeEvent = { type: "text", text: "alpha" };
    const second: BridgeEvent = { type: "done" };
    const events: BridgeEvent[] = [first, second];
    const retainedBytes = measureBridgeEventBytes(first) + measureBridgeEventBytes(second);

    const nextRetainedBytes = dropBufferedBridgeEvents({
      events,
      retainedBytes,
      dropCount: 1,
    });

    expect(events).toEqual([second]);
    expect(nextRetainedBytes).toBe(measureBridgeEventBytes(second));
  });
});

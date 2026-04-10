import { describe, expect, test } from "bun:test";
import { createScriptOutputBuffer } from "../electron/main/workspace-scripts/output-buffer";

function waitForImmediate() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

describe("createScriptOutputBuffer", () => {
  test("batches multiple chunks pushed in the same tick", async () => {
    const flushed: string[] = [];
    const buffer = createScriptOutputBuffer((output) => flushed.push(output));

    buffer.push("hello");
    buffer.push(" ");
    buffer.push("world");

    expect(flushed).toEqual([]);

    await waitForImmediate();

    expect(flushed).toEqual(["hello world"]);
  });

  test("ignores empty chunks", async () => {
    const flushed: string[] = [];
    const buffer = createScriptOutputBuffer((output) => flushed.push(output));

    buffer.push("");
    await waitForImmediate();

    expect(flushed).toEqual([]);
  });

  test("flush emits pending output immediately", async () => {
    const flushed: string[] = [];
    const buffer = createScriptOutputBuffer((output) => flushed.push(output));

    buffer.push("partial");
    buffer.flush();

    expect(flushed).toEqual(["partial"]);

    await waitForImmediate();

    expect(flushed).toEqual(["partial"]);
  });
});

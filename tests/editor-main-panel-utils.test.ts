import { describe, expect, test } from "bun:test";
import { releaseDiffEditorModels } from "../src/components/layout/editor-main-panel.utils";

describe("releaseDiffEditorModels", () => {
  test("detaches the diff editor model before disposing both sides", () => {
    const calls: string[] = [];
    const editor = {
      getModel: () => ({
        original: {
          dispose: () => {
            calls.push("dispose:original");
          },
        },
        modified: {
          dispose: () => {
            calls.push("dispose:modified");
          },
        },
      }),
      setModel: (_model: null) => {
        calls.push("setModel:null");
      },
    };

    const released = releaseDiffEditorModels(editor);

    expect(released).toBe(true);
    expect(calls).toEqual([
      "setModel:null",
      "dispose:original",
      "dispose:modified",
    ]);
  });

  test("is a no-op when no diff model is attached", () => {
    const editor = {
      getModel: () => null,
      setModel: (_model: null) => {
        throw new Error("setModel should not be called");
      },
    };

    expect(releaseDiffEditorModels(editor)).toBe(false);
    expect(releaseDiffEditorModels(null)).toBe(false);
  });
});

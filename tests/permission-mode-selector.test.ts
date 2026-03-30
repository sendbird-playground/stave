import { describe, expect, test } from "bun:test";
import { cyclePermissionMode, getPermissionModeOptions } from "../src/components/ai-elements/permission-mode-selector";

describe("Codex permission mode options", () => {
  test("lists the supported approval policies", () => {
    expect(getPermissionModeOptions("codex").map((option) => option.value)).toEqual([
      "never",
      "on-request",
      "untrusted",
    ]);
  });

  test("cycles through on-request to untrusted", () => {
    expect(cyclePermissionMode({ providerId: "codex", current: "on-request" })).toBe("untrusted");
  });
});

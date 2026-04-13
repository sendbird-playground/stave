import { describe, expect, test } from "bun:test";
import {
  CLAUDE_CLI_AUTO_MODE_MIN_VERSION,
  isClaudeCliAutoModeSupportedVersion,
} from "../electron/providers/claude-cli-compat";

describe("Claude CLI auto mode support", () => {
  test("requires Claude Code 2.1.71 or newer", () => {
    expect(CLAUDE_CLI_AUTO_MODE_MIN_VERSION).toEqual({
      major: 2,
      minor: 1,
      patch: 71,
    });
    expect(
      isClaudeCliAutoModeSupportedVersion({
        version: { major: 2, minor: 1, patch: 70 },
      }),
    ).toBe(false);
    expect(
      isClaudeCliAutoModeSupportedVersion({
        version: { major: 2, minor: 1, patch: 71 },
      }),
    ).toBe(true);
    expect(
      isClaudeCliAutoModeSupportedVersion({
        version: { major: 2, minor: 1, patch: 105 },
      }),
    ).toBe(true);
  });

  test("treats unknown versions as unsupported", () => {
    expect(
      isClaudeCliAutoModeSupportedVersion({
        version: null,
      }),
    ).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import {
  parseAheadBehindCounts,
  parseClaudeAuthState,
  parseCodexAuthState,
  parseGhAuthState,
} from "../electron/main/utils/tooling-status";

describe("tooling status helpers", () => {
  test("parses ahead/behind counts from git rev-list output", () => {
    expect(parseAheadBehindCounts({ stdout: "3\t7\n" })).toEqual({
      ahead: 3,
      behind: 7,
    });
  });

  test("derives authenticated GitHub CLI state from gh auth status output", () => {
    expect(parseGhAuthState({
      ok: true,
      stdout: "github.com\n  ✓ Logged in to github.com account demo (keyring)\n",
      stderr: "",
    })).toEqual({
      authState: "authenticated",
      authDetail: "github.com\n  ✓ Logged in to github.com account demo (keyring)",
    });
  });

  test("derives Codex login requirement from login status failure output", () => {
    expect(parseCodexAuthState({
      ok: false,
      stdout: "",
      stderr: "Not logged in. Run `codex login` first.",
    })).toEqual({
      authState: "unauthenticated",
      authDetail: "Not logged in. Run `codex login` first.",
    });
  });

  test("parses Claude auth status JSON", () => {
    expect(parseClaudeAuthState({
      ok: true,
      stdout: JSON.stringify({
        loggedIn: true,
        email: "dev@example.com",
        orgName: "Acme",
      }),
      stderr: "",
    })).toEqual({
      authState: "authenticated",
      authDetail: "Authenticated · dev@example.com · org: Acme",
    });
  });
});

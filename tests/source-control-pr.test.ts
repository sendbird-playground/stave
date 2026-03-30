import { describe, expect, test } from "bun:test";
import {
  generateFallbackPullRequestDraft,
  mergePullRequestDraft,
  parsePullRequestSuggestionResponse,
} from "../src/lib/source-control-pr";

describe("generateFallbackPullRequestDraft", () => {
  test("prefers a conventional commit title from the branch history", () => {
    const draft = generateFallbackPullRequestDraft({
      baseBranch: "main",
      headBranch: "fix/jacob/create-pr-slow",
      commitLog: "abc123 fix(topbar): stabilize create pr flow",
      fileList: "M src/components/layout/TopBarOpenPR.tsx\nM electron/main/ipc/scm.ts",
    });

    expect(draft.title).toBe("fix(topbar): stabilize create pr flow");
    expect(draft.body).toContain("## Summary");
    expect(draft.body).toContain("## Changes");
    expect(draft.body).toContain("`src/components/layout/TopBarOpenPR.tsx`");
  });

  test("derives a conventional title from the branch name when no commits exist", () => {
    const draft = generateFallbackPullRequestDraft({
      baseBranch: "main",
      headBranch: "fix/topbar/create-pr-slow",
      fileList: "M src/components/layout/TopBarOpenPR.tsx",
    });

    expect(draft.title).toBe("fix(topbar): create pr slow");
  });
});

describe("parsePullRequestSuggestionResponse", () => {
  test("recovers a body when the model omits the BODY marker", () => {
    const parsed = parsePullRequestSuggestionResponse([
      "TITLE: fix(topbar): stabilize create pr flow",
      "## Summary",
      "- Improve the first PR generation attempt",
      "",
      "## Changes",
      "- Use fallback content while the model response is still loading",
    ].join("\n"));

    expect(parsed.title).toBe("fix(topbar): stabilize create pr flow");
    expect(parsed.body).toContain("## Summary");
    expect(parsed.body).toContain("## Changes");
  });
});

describe("mergePullRequestDraft", () => {
  test("keeps the fallback when the generated suggestion is too weak", () => {
    const merged = mergePullRequestDraft({
      fallbackTitle: "fix(topbar): stabilize create pr flow",
      fallbackBody: "## Summary\n- Keep the fallback body.\n\n## Changes\n- Preserve the existing content.",
      generatedTitle: "Pull Request Update",
      generatedBody: "",
    });

    expect(merged).toEqual({
      title: "fix(topbar): stabilize create pr flow",
      body: "## Summary\n- Keep the fallback body.\n\n## Changes\n- Preserve the existing content.",
    });
  });
});

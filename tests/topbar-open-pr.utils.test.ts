import { describe, expect, test } from "bun:test";
import { buildCreatePrTargetBranchOptions } from "../src/components/layout/TopBarOpenPR.utils";

describe("buildCreatePrTargetBranchOptions", () => {
  test("uses normalized origin branches for PR targets and excludes the current branch", () => {
    expect(buildCreatePrTargetBranchOptions({
      defaultBranch: "main",
      headBranch: "feature/create-pr-layout",
      remoteBranches: [
        "origin/feature/create-pr-layout",
        "origin/main",
        "origin/release",
        "upstream/develop",
      ],
    })).toEqual(["main", "release"]);
  });

  test("falls back to non-origin remotes when origin branches are unavailable", () => {
    expect(buildCreatePrTargetBranchOptions({
      defaultBranch: "develop",
      headBranch: "feature/create-pr-layout",
      remoteBranches: ["upstream/release", "upstream/develop"],
    })).toEqual(["develop", "release"]);
  });

  test("falls back to the default branch when no remote branches are available", () => {
    expect(buildCreatePrTargetBranchOptions({
      defaultBranch: "main",
      headBranch: "feature/create-pr-layout",
      remoteBranches: [],
    })).toEqual(["main"]);
  });
});

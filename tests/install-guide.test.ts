import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dirname, "..");

describe("install guide", () => {
  test("documents a gh-authenticated one-command installer", () => {
    const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
    const guide = readFileSync(path.join(repoRoot, "docs", "install-guide.md"), "utf8");

    expect(readme).toContain("docs/install-guide.md");
    expect(readme).toContain("gh api -H 'Accept: application/vnd.github.v3.raw+json' repos/sendbird-playground/stave/contents/scripts/install-latest-release.sh | bash");
    expect(guide).toContain("gh auth login");
    expect(guide).toContain("gh auth status");
    expect(guide).toContain("gh auth refresh -h github.com -s repo,read:org");
  });

  test("ships an installer script that downloads the latest macOS zip and removes quarantine", () => {
    const installer = readFileSync(path.join(repoRoot, "scripts", "install-latest-release.sh"), "utf8");

    expect(installer).toContain("gh release download");
    expect(installer).toContain("Stave-macOS.zip");
    expect(installer).toContain("xattr -dr com.apple.quarantine");
    expect(installer).toContain("gh auth login");
  });
});

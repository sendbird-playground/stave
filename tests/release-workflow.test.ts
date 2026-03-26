import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dirname, "..");

describe("release packaging workflow", () => {
  test("publishes an internal macOS zip bundle built from the unpacked app", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "release.yml"), "utf8");

    expect(workflow).toContain("Package unpacked macOS app bundle");
    expect(workflow).toContain("Prepare internal macOS release bundle");
    expect(workflow).toContain("bunx --bun electron-builder --config electron-builder.yml --dir");
    expect(workflow).toContain("node scripts/prepare-macos-release-bundle.mjs");
    expect(workflow).toContain("files: release/Stave-macOS.zip");
  });

  test("ships an installer helper that removes quarantine after copying the app", () => {
    const installer = readFileSync(path.join(repoRoot, "scripts", "install-stave.command"), "utf8");

    expect(installer).toContain("$HOME/Applications");
    expect(installer).toContain("xattr -dr com.apple.quarantine");
    expect(installer).toContain("open \"$TARGET_APP\"");
  });
});

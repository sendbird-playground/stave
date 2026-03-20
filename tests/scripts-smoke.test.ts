import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import packageJson from "../package.json";

describe("package scripts", () => {
  test("contains expected dev/build scripts", () => {
    const scripts = packageJson.scripts as Record<string, string>;
    expect(typeof scripts.dev).toBe("string");
    expect(typeof scripts["dev:all"]).toBe("string");
    expect(typeof scripts["dev:desktop"]).toBe("string");
    expect(typeof scripts["build:desktop"]).toBe("string");
  });

  test("desktop packaging scripts rebuild Electron native dependencies automatically", () => {
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts["rebuild:electron-deps"]).toBe("node scripts/rebuild-electron-deps.mjs");
    expect(scripts["package:desktop"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
    expect(scripts["run:desktop:built"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
    expect(scripts["package:linux:dir"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
    expect(scripts["package:linux:appimage"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
    expect(scripts["package:linux:deb"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
  });

  test("electron-builder skips its own native rebuild because packaging scripts rebuild first", () => {
    const config = readFileSync(path.join(import.meta.dirname, "..", "electron-builder.yml"), "utf8");
    expect(config.includes("npmRebuild: false")).toBe(true);
  });
});

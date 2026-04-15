import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildExecutableLookupEnv,
  normalizeExecutableCandidate,
  resolveExecutablePath,
  toAsarUnpackedPath,
} from "../electron/providers/executable-path";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (!directory) {
      continue;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("resolveExecutablePath", () => {
  test("prefers an explicit executable path over PATH lookup", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "stave-exec-"));
    tempDirs.push(directory);
    const executablePath = path.join(
      directory,
      process.platform === "win32" ? "demo.cmd" : "demo",
    );
    writeFileSync(
      executablePath,
      process.platform === "win32"
        ? "@echo off\r\necho demo\r\n"
        : "#!/bin/sh\necho demo\n",
      "utf8",
    );
    chmodSync(executablePath, 0o755);

    const resolved = resolveExecutablePath({
      absolutePathEnvVar: "STAVE_TEST_ABSOLUTE_PATH",
      commandEnvVar: "STAVE_TEST_COMMAND",
      defaultCommand: "stave-command-that-does-not-exist",
      explicitPaths: [executablePath],
    });

    expect(resolved).toBe(executablePath);
  });

  test("normalizes alias-shaped explicit path candidates before validating them", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "stave-exec-"));
    tempDirs.push(directory);
    const executablePath = path.join(
      directory,
      process.platform === "win32" ? "demo.cmd" : "demo",
    );
    writeFileSync(
      executablePath,
      process.platform === "win32"
        ? "@echo off\r\necho demo\r\n"
        : "#!/bin/sh\necho demo\n",
      "utf8",
    );
    chmodSync(executablePath, 0o755);

    const resolved = resolveExecutablePath({
      absolutePathEnvVar: "STAVE_TEST_ABSOLUTE_PATH",
      commandEnvVar: "STAVE_TEST_COMMAND",
      defaultCommand: "stave-command-that-does-not-exist",
      explicitPaths: [`demo: aliased to ${executablePath}`],
    });

    expect(resolved).toBe(executablePath);
  });
});

describe("normalizeExecutableCandidate", () => {
  test("extracts a path from zsh which alias output", () => {
    expect(
      normalizeExecutableCandidate({
        value: "claude: aliased to /tmp/claude",
      }),
    ).toBe("/tmp/claude");
  });

  test("extracts a path from command -v alias output", () => {
    expect(
      normalizeExecutableCandidate({
        value: "alias claude=/tmp/claude",
      }),
    ).toBe("/tmp/claude");
  });

  test("skips warning lines and keeps the first executable-like candidate", () => {
    expect(
      normalizeExecutableCandidate({
        value: "WARNING: stale shell cache\nclaude is /tmp/claude",
      }),
    ).toBe("/tmp/claude");
  });
});

describe("buildExecutableLookupEnv", () => {
  test("prepends extra paths ahead of the base PATH", () => {
    const env = buildExecutableLookupEnv({
      baseEnv: { PATH: "/usr/bin:/bin" },
      extraPaths: ["/opt/demo/bin", "/usr/bin"],
      loginShellPath: "/opt/shell/bin:/usr/local/bin",
    });

    const parts = (env.PATH ?? "").split(path.delimiter);
    expect(parts[0]).toBe("/opt/demo/bin");
    expect(parts).toContain("/opt/shell/bin");
    expect(parts.filter((entry) => entry === "/usr/bin")).toHaveLength(1);
  });
});

describe("toAsarUnpackedPath", () => {
  test("rewrites packaged Electron paths to app.asar.unpacked", () => {
    expect(
      toAsarUnpackedPath(
        "/Applications/Stave.app/Contents/Resources/app.asar/node_modules/@openai/codex/vendor/bin/codex",
      ),
    ).toBe(
      "/Applications/Stave.app/Contents/Resources/app.asar.unpacked/node_modules/@openai/codex/vendor/bin/codex",
    );
  });

  test("leaves non-asar paths unchanged", () => {
    const input =
      "/Users/demo/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/codex/codex";
    expect(toAsarUnpackedPath(input)).toBe(input);
  });
});

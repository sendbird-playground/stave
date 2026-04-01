import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { runCommand, runCommandArgs } from "../electron/main/utils/command";

const createdPaths: string[] = [];
const originalPath = process.env.PATH;

afterEach(() => {
  process.env.PATH = originalPath;

  while (createdPaths.length > 0) {
    const targetPath = createdPaths.pop();
    if (!targetPath) {
      continue;
    }
    rmSync(targetPath, { recursive: true, force: true });
  }
});

describe("command PATH lookup regressions", () => {
  test("runCommandArgs resolves executables from the augmented login-shell PATH", async () => {
    if (process.platform === "win32") {
      return;
    }

    const binDir = path.join(homedir(), ".local", "bin");
    mkdirSync(binDir, { recursive: true });

    const executablePath = path.join(binDir, `stave-gh-fixture-${process.pid}-${Date.now()}`);
    createdPaths.push(executablePath);
    writeFileSync(executablePath, "#!/bin/sh\nprintf 'fixture-ok'\n", "utf8");
    chmodSync(executablePath, 0o755);

    process.env.PATH = "/usr/bin:/bin";

    const result = await runCommandArgs({ command: path.basename(executablePath) });
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("fixture-ok");
  });

  test("runCommand resolves executables from the augmented login-shell PATH", async () => {
    if (process.platform === "win32") {
      return;
    }

    const binDir = path.join(homedir(), ".local", "bin");
    mkdirSync(binDir, { recursive: true });

    const executablePath = path.join(binDir, `stave-shell-fixture-${process.pid}-${Date.now()}`);
    createdPaths.push(executablePath);
    writeFileSync(executablePath, "#!/bin/sh\nprintf 'shell-ok'\n", "utf8");
    chmodSync(executablePath, 0o755);

    process.env.PATH = "/usr/bin:/bin";

    const result = await runCommand({ command: path.basename(executablePath) });
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("shell-ok");
  });
});

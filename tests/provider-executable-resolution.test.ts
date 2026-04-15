import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveClaudeExecutablePath } from "../electron/providers/claude-sdk-runtime";
import {
  resolveClaudeCliExecutablePath,
  resolveCodexCliExecutablePath,
} from "../electron/providers/cli-path-env";
import { resolveCodexExecutablePath as resolveCodexAppServerExecutablePath } from "../electron/providers/codex-app-server-runtime";
import { resolveCodexExecutablePath as resolveCodexSdkExecutablePath } from "../electron/providers/codex-sdk-runtime";

const createdDirectories: string[] = [];

afterEach(() => {
  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop();
    if (!directory) {
      continue;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

function createHomeExecutable(args: { prefix: string; commandName: string }) {
  const homeDirectory = process.env.HOME?.trim();
  if (!homeDirectory) {
    return null;
  }

  const directory = mkdtempSync(path.join(homeDirectory, args.prefix));
  createdDirectories.push(directory);
  const executablePath = path.join(directory, args.commandName);
  writeFileSync(executablePath, "#!/bin/sh\necho demo\n", "utf8");
  chmodSync(executablePath, 0o755);

  return {
    executablePath,
    tildePath: `~/${path.relative(homeDirectory, executablePath)}`,
  };
}

function withTemporaryEnv(
  values: Record<string, string | undefined>,
  run: () => void,
) {
  const previousValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previousValues.set(key, process.env[key]);
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }

  try {
    run();
  } finally {
    for (const [key, value] of previousValues.entries()) {
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}

describe("provider executable resolution", () => {
  test("normalizes tilde-prefixed Claude binary overrides for tooling and runtime resolvers", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-claude-bin-",
      commandName: "claude",
    });
    if (!fixture) {
      return;
    }

    expect(
      resolveClaudeCliExecutablePath({ explicitPath: fixture.tildePath }),
    ).toBe(fixture.executablePath);
    expect(
      resolveClaudeExecutablePath({ explicitPath: fixture.tildePath }),
    ).toBe(fixture.executablePath);
  });

  test("uses the same normalized Claude env override path for tooling and runtime resolvers", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-claude-env-bin-",
      commandName: "claude",
    });
    if (!fixture) {
      return;
    }

    withTemporaryEnv(
      {
        STAVE_CLAUDE_CLI_PATH: fixture.tildePath,
        CLAUDE_CODE_PATH: undefined,
      },
      () => {
        expect(resolveClaudeCliExecutablePath()).toBe(fixture.executablePath);
        expect(resolveClaudeExecutablePath()).toBe(fixture.executablePath);
      },
    );
  });

  test("normalizes tilde-prefixed Codex binary overrides for tooling and both runtime backends", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-codex-bin-",
      commandName: "codex",
    });
    if (!fixture) {
      return;
    }

    expect(
      resolveCodexCliExecutablePath({ explicitPath: fixture.tildePath }),
    ).toBe(fixture.executablePath);
    expect(
      resolveCodexSdkExecutablePath({ explicitPath: fixture.tildePath }),
    ).toBe(fixture.executablePath);
    expect(
      resolveCodexAppServerExecutablePath({ explicitPath: fixture.tildePath }),
    ).toBe(fixture.executablePath);
  });

  test("uses the same normalized Codex env override path for tooling and both runtime backends", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixture = createHomeExecutable({
      prefix: ".stave-codex-env-bin-",
      commandName: "codex",
    });
    if (!fixture) {
      return;
    }

    withTemporaryEnv(
      {
        STAVE_CODEX_CLI_PATH: fixture.tildePath,
      },
      () => {
        expect(resolveCodexCliExecutablePath()).toBe(fixture.executablePath);
        expect(resolveCodexSdkExecutablePath()).toBe(fixture.executablePath);
        expect(resolveCodexAppServerExecutablePath()).toBe(
          fixture.executablePath,
        );
      },
    );
  });
});

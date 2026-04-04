// ---------------------------------------------------------------------------
// Workspace Automations – Execution Engine (Electron main process)
// ---------------------------------------------------------------------------

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { webContents } from "electron";
import * as pty from "node-pty";
import {
  AUTOMATION_ENV_VARS,
} from "../../../src/lib/workspace-scripts/constants";
import {
  getAutomationEntry,
  getAutomationHooksForTrigger,
} from "../../../src/lib/workspace-scripts/config";
import type {
  AutomationKind,
  AutomationTrigger,
  ResolvedWorkspaceAutomation,
  ResolvedWorkspaceAutomationsConfig,
  WorkspaceAutomationEvent,
  WorkspaceAutomationEventEnvelope,
  WorkspaceAutomationHookRunSummary,
  WorkspaceAutomationRunSource,
  WorkspaceAutomationStatusEntry,
} from "../../../src/lib/workspace-scripts/types";
import { buildExecutableLookupEnv } from "../../providers/executable-path";
import {
  deleteWorkspaceAutomationProcess,
  getAutomationProcessKey,
  getWorkspaceAutomationProcess,
  listWorkspaceAutomationProcessKeys,
  listWorkspaceAutomationProcessesForWorkspace,
  setWorkspaceAutomationProcess,
  type WorkspaceAutomationProcess,
} from "./state";
import {
  buildOrbitCommand,
  extractOrbitOutput,
  resolvePortlessCommand,
} from "./orbit";

const SIGTERM_GRACE_MS = 5_000;

function broadcastAutomationEvent(envelope: WorkspaceAutomationEventEnvelope) {
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.isDestroyed()) {
      wc.send("workspace-automations:event", envelope);
    }
  }
}

function emitAutomationEvent(args: {
  workspaceId: string;
  automationId: string;
  automationKind: AutomationKind;
  runId: string;
  sessionId?: string;
  source: WorkspaceAutomationRunSource;
  event: WorkspaceAutomationEvent;
}) {
  broadcastAutomationEvent(args);
}

function buildAutomationEnv(args: {
  projectPath: string;
  workspaceName: string;
  workspacePath: string;
  branch: string;
  automation: ResolvedWorkspaceAutomation;
  source: WorkspaceAutomationRunSource;
}): NodeJS.ProcessEnv {
  return {
    ...buildExecutableLookupEnv(),
    [AUTOMATION_ENV_VARS.ROOT_PATH]: args.projectPath,
    [AUTOMATION_ENV_VARS.WORKSPACE_NAME]: args.workspaceName,
    [AUTOMATION_ENV_VARS.WORKSPACE_PATH]: args.workspacePath,
    [AUTOMATION_ENV_VARS.BRANCH]: args.branch,
    [AUTOMATION_ENV_VARS.TARGET_ID]: args.automation.targetId,
    ...(args.source.kind === "hook" ? { [AUTOMATION_ENV_VARS.TRIGGER]: args.source.trigger } : {}),
    ...args.automation.target.env,
  };
}

function resolveAutomationCwd(args: {
  projectPath: string;
  workspacePath: string;
  automation: ResolvedWorkspaceAutomation;
}) {
  return args.automation.target.cwd === "project" ? args.projectPath : args.workspacePath;
}

function createProcessKey(args: {
  workspaceId: string;
  automationId: string;
  automationKind: AutomationKind;
}) {
  return getAutomationProcessKey(args);
}

function createProcessEntry(args: {
  workspaceId: string;
  automationId: string;
  automationKind: AutomationKind;
  runId: string;
  source: WorkspaceAutomationRunSource;
  process: WorkspaceAutomationProcess["process"];
  sessionId?: string;
}) {
  const entry: WorkspaceAutomationProcess = {
    workspaceId: args.workspaceId,
    automationId: args.automationId,
    automationKind: args.automationKind,
    runId: args.runId,
    source: args.source,
    process: args.process,
    aborted: false,
    sessionId: args.sessionId,
  };
  setWorkspaceAutomationProcess(
    createProcessKey({
      workspaceId: args.workspaceId,
      automationId: args.automationId,
      automationKind: args.automationKind,
    }),
    entry,
  );
  return entry;
}

function killProcess(proc: ChildProcess | pty.IPty): Promise<void> {
  return new Promise<void>((resolve) => {
    let resolved = false;
    const done = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    try {
      proc.kill("SIGTERM");
    } catch {
      done();
      return;
    }

    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // noop
      }
      done();
    }, SIGTERM_GRACE_MS);

    if ("on" in proc && typeof proc.on === "function") {
      (proc as ChildProcess).once("close", () => {
        clearTimeout(timer);
        done();
      });
    } else if ("onExit" in proc && typeof proc.onExit === "function") {
      (proc as pty.IPty).onExit(() => {
        clearTimeout(timer);
        done();
      });
    }
  });
}

export async function stopAutomationEntry(args: {
  workspaceId: string;
  automationId: string;
  automationKind: AutomationKind;
}): Promise<void> {
  const key = createProcessKey(args);
  const entry = getWorkspaceAutomationProcess(key);
  if (!entry) {
    return;
  }
  entry.aborted = true;
  if (entry.process) {
    await killProcess(entry.process);
  }
  emitAutomationEvent({
    workspaceId: entry.workspaceId,
    automationId: entry.automationId,
    automationKind: entry.automationKind,
    runId: entry.runId,
    sessionId: entry.sessionId,
    source: entry.source,
    event: { type: "stopped" },
  });
  deleteWorkspaceAutomationProcess(key);
}

async function runFiniteAutomation(args: {
  workspaceId: string;
  automation: ResolvedWorkspaceAutomation;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  source: WorkspaceAutomationRunSource;
}) {
  const runId = randomUUID();
  const key = createProcessKey({
    workspaceId: args.workspaceId,
    automationId: args.automation.id,
    automationKind: args.automation.kind,
  });

  await stopAutomationEntry({
    workspaceId: args.workspaceId,
    automationId: args.automation.id,
    automationKind: args.automation.kind,
  });

  const env = buildAutomationEnv(args);
  const cwd = resolveAutomationCwd(args);
  const entry = createProcessEntry({
    workspaceId: args.workspaceId,
    automationId: args.automation.id,
    automationKind: args.automation.kind,
    runId,
    source: args.source,
    process: null,
  });

  let lastExitCode = 0;

  for (let index = 0; index < args.automation.commands.length; index += 1) {
    if (entry.aborted) {
      deleteWorkspaceAutomationProcess(key);
      return { ok: false as const, runId, exitCode: -1, error: "Aborted" };
    }

    const command = args.automation.commands[index];
    emitAutomationEvent({
      workspaceId: args.workspaceId,
      automationId: args.automation.id,
      automationKind: args.automation.kind,
      runId,
      source: args.source,
      event: {
        type: "started",
        commandIndex: index,
        command,
        totalCommands: args.automation.commands.length,
      },
    });

    try {
      lastExitCode = await new Promise<number>((resolve, reject) => {
        const child = spawn(command, {
          shell: args.automation.target.shell ?? true,
          cwd,
          env,
        });

        entry.process = child;

        child.stdout?.on("data", (chunk: Buffer) => {
          emitAutomationEvent({
            workspaceId: args.workspaceId,
            automationId: args.automation.id,
            automationKind: args.automation.kind,
            runId,
            source: args.source,
            event: { type: "output", data: chunk.toString() },
          });
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          emitAutomationEvent({
            workspaceId: args.workspaceId,
            automationId: args.automation.id,
            automationKind: args.automation.kind,
            runId,
            source: args.source,
            event: { type: "output", data: chunk.toString() },
          });
        });

        child.on("error", reject);
        child.on("close", (code) => resolve(code ?? -1));

        if (args.automation.timeoutMs) {
          setTimeout(() => {
            if (!entry.aborted) {
              entry.aborted = true;
              try {
                child.kill("SIGKILL");
              } catch {
                // noop
              }
              reject(new Error(`Automation timed out after ${args.automation.timeoutMs}ms`));
            }
          }, args.automation.timeoutMs);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitAutomationEvent({
        workspaceId: args.workspaceId,
        automationId: args.automation.id,
        automationKind: args.automation.kind,
        runId,
        source: args.source,
        event: { type: "error", error: message },
      });
      deleteWorkspaceAutomationProcess(key);
      return { ok: false as const, runId, exitCode: -1, error: message };
    }

    entry.process = null;
    emitAutomationEvent({
      workspaceId: args.workspaceId,
      automationId: args.automation.id,
      automationKind: args.automation.kind,
      runId,
      source: args.source,
      event: { type: "command-completed", commandIndex: index, exitCode: lastExitCode },
    });

    if (lastExitCode !== 0) {
      emitAutomationEvent({
        workspaceId: args.workspaceId,
        automationId: args.automation.id,
        automationKind: args.automation.kind,
        runId,
        source: args.source,
        event: { type: "completed", exitCode: lastExitCode },
      });
      deleteWorkspaceAutomationProcess(key);
      return { ok: false as const, runId, exitCode: lastExitCode };
    }
  }

  emitAutomationEvent({
    workspaceId: args.workspaceId,
    automationId: args.automation.id,
    automationKind: args.automation.kind,
    runId,
    source: args.source,
    event: { type: "completed", exitCode: 0 },
  });
  deleteWorkspaceAutomationProcess(key);
  return { ok: true as const, runId, exitCode: 0 };
}

async function runServiceAutomation(args: {
  workspaceId: string;
  automation: ResolvedWorkspaceAutomation;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  source: WorkspaceAutomationRunSource;
}) {
  const key = createProcessKey({
    workspaceId: args.workspaceId,
    automationId: args.automation.id,
    automationKind: args.automation.kind,
  });
  const existing = getWorkspaceAutomationProcess(key);
  if (existing && !existing.aborted && args.automation.restartOnRun === false) {
    return {
      ok: true as const,
      runId: existing.runId,
      sessionId: existing.sessionId,
      alreadyRunning: true,
    };
  }

  await stopAutomationEntry({
    workspaceId: args.workspaceId,
    automationId: args.automation.id,
    automationKind: args.automation.kind,
  });

  const runId = randomUUID();
  const env = buildAutomationEnv(args);
  const cwd = resolveAutomationCwd(args);
  const prefixCommands = args.automation.commands.slice(0, -1);
  const lastCommand = args.automation.commands[args.automation.commands.length - 1];

  if (!lastCommand) {
    return { ok: true as const, runId };
  }

  if (prefixCommands.length > 0) {
    const prefixResult = await runFiniteAutomation({
      ...args,
      automation: { ...args.automation, commands: prefixCommands },
    });
    if (!prefixResult.ok) {
      return prefixResult;
    }
  }

  if (args.automation.orbit && args.automation.target.cwd !== "workspace") {
    return {
      ok: false as const,
      runId,
      error: "Orbit services must target the workspace path.",
      exitCode: -1,
    };
  }

  const orbitCommand = args.automation.orbit
    ? resolvePortlessCommand()
    : null;
  if (args.automation.orbit && !orbitCommand) {
    return {
      ok: false as const,
      runId,
      error: "Orbit could not find the portless executable.",
      exitCode: -1,
    };
  }

  const commandToRun = args.automation.orbit && orbitCommand
    ? buildOrbitCommand({
        command: lastCommand,
        orbit: args.automation.orbit,
        defaultName: path.basename(args.projectPath),
        portlessCommand: orbitCommand,
      })
    : lastCommand;

  const shellExe = args.automation.target.shell || process.env.SHELL || "/bin/bash";
  const ptyProcess = pty.spawn(shellExe, ["-c", commandToRun], {
    name: "xterm-color",
    cols: 120,
    rows: 30,
    cwd,
    env: env as Record<string, string>,
  });
  const sessionId = randomUUID();

  createProcessEntry({
    workspaceId: args.workspaceId,
    automationId: args.automation.id,
    automationKind: args.automation.kind,
    runId,
    source: args.source,
    process: ptyProcess,
    sessionId,
  });

  emitAutomationEvent({
    workspaceId: args.workspaceId,
    automationId: args.automation.id,
    automationKind: args.automation.kind,
    runId,
    sessionId,
    source: args.source,
    event: {
      type: "started",
      commandIndex: args.automation.commands.length - 1,
      command: commandToRun,
      totalCommands: args.automation.commands.length,
    },
  });

  let orbitBuffer = "";
  ptyProcess.onData((data) => {
    if (args.automation.orbit) {
      const parsed = extractOrbitOutput({
        buffer: orbitBuffer,
        chunk: data,
      });
      orbitBuffer = parsed.buffer;

      for (const orbitUrl of parsed.orbitUrls) {
        emitAutomationEvent({
          workspaceId: args.workspaceId,
          automationId: args.automation.id,
          automationKind: args.automation.kind,
          runId,
          sessionId,
          source: args.source,
          event: { type: "orbit-url", url: orbitUrl },
        });
      }

      if (!parsed.output) {
        return;
      }

      emitAutomationEvent({
        workspaceId: args.workspaceId,
        automationId: args.automation.id,
        automationKind: args.automation.kind,
        runId,
        sessionId,
        source: args.source,
        event: { type: "output", data: parsed.output },
      });
      return;
    }

    emitAutomationEvent({
      workspaceId: args.workspaceId,
      automationId: args.automation.id,
      automationKind: args.automation.kind,
      runId,
      sessionId,
      source: args.source,
      event: { type: "output", data },
    });
  });

  ptyProcess.onExit(({ exitCode }) => {
    if (orbitBuffer) {
      emitAutomationEvent({
        workspaceId: args.workspaceId,
        automationId: args.automation.id,
        automationKind: args.automation.kind,
        runId,
        sessionId,
        source: args.source,
        event: { type: "output", data: orbitBuffer },
      });
    }
    emitAutomationEvent({
      workspaceId: args.workspaceId,
      automationId: args.automation.id,
      automationKind: args.automation.kind,
      runId,
      sessionId,
      source: args.source,
      event: { type: "completed", exitCode: exitCode ?? -1 },
    });
    deleteWorkspaceAutomationProcess(key);
  });

  return { ok: true as const, runId, sessionId };
}

export async function runAutomationEntry(args: {
  workspaceId: string;
  automation: ResolvedWorkspaceAutomation;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  source?: WorkspaceAutomationRunSource;
}) {
  const source = args.source ?? { kind: "manual" as const };
  if (args.automation.kind === "service") {
    return runServiceAutomation({ ...args, source });
  }
  return runFiniteAutomation({ ...args, source });
}

export async function runAutomationHook(args: {
  workspaceId: string;
  trigger: AutomationTrigger;
  config: ResolvedWorkspaceAutomationsConfig;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
}): Promise<WorkspaceAutomationHookRunSummary> {
  const refs = getAutomationHooksForTrigger(args.config, args.trigger);
  const summary: WorkspaceAutomationHookRunSummary = {
    trigger: args.trigger,
    totalEntries: refs.length,
    executedEntries: 0,
    failures: [],
  };

  for (const ref of refs) {
    const automation = getAutomationEntry(args.config, {
      automationId: ref.automationId,
      kind: ref.automationKind,
    });
    if (!automation) {
      summary.failures.push({
        automationId: ref.automationId,
        message: "Automation entry not found.",
      });
      if (ref.blocking) {
        break;
      }
      continue;
    }

    const result = await runAutomationEntry({
      workspaceId: args.workspaceId,
      automation,
      projectPath: args.projectPath,
      workspacePath: args.workspacePath,
      workspaceName: args.workspaceName,
      branch: args.branch,
      source: { kind: "hook", trigger: args.trigger },
    });

    if (!result.ok) {
      summary.failures.push({
        automationId: ref.automationId,
        message: "error" in result && result.error ? result.error : `Exited with ${result.exitCode ?? -1}`,
      });
      if (ref.blocking) {
        break;
      }
      continue;
    }

    summary.executedEntries += 1;
  }

  return summary;
}

export function getAutomationStatuses(args: {
  workspaceId: string;
}): WorkspaceAutomationStatusEntry[] {
  return listWorkspaceAutomationProcessesForWorkspace(args.workspaceId).map((entry) => ({
    automationId: entry.automationId,
    automationKind: entry.automationKind,
    running: !entry.aborted,
    runId: entry.runId,
    sessionId: entry.sessionId,
    source: entry.source,
  }));
}

export async function stopAllWorkspaceAutomationProcesses(args: {
  workspaceId: string;
}): Promise<void> {
  const entries = listWorkspaceAutomationProcessesForWorkspace(args.workspaceId);
  await Promise.all(entries.map((entry) => stopAutomationEntry({
    workspaceId: entry.workspaceId,
    automationId: entry.automationId,
    automationKind: entry.automationKind,
  })));
}

export async function cleanupAllAutomationProcesses(): Promise<void> {
  const keys = listWorkspaceAutomationProcessKeys();
  await Promise.all(keys.map(async (key) => {
    const entry = getWorkspaceAutomationProcess(key);
    if (!entry) {
      return;
    }
    entry.aborted = true;
    if (entry.process) {
      await killProcess(entry.process);
    }
    deleteWorkspaceAutomationProcess(key);
  }));
}

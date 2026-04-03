// ---------------------------------------------------------------------------
// Workspace Lifecycle Scripts – Execution Engine (Electron main process)
// ---------------------------------------------------------------------------

import { spawn, type ChildProcess } from "node:child_process";
import { webContents } from "electron";
import * as pty from "node-pty";
import { randomUUID } from "node:crypto";
import { SCRIPT_ENV_VARS } from "../../../src/lib/workspace-scripts/constants";
import type {
  ScriptPhase,
  ScriptPhaseEvent,
  ScriptPhaseEventEnvelope,
  ResolvedScriptsConfig,
} from "../../../src/lib/workspace-scripts/types";
import { buildExecutableLookupEnv } from "../../providers/executable-path";
import {
  getWorkspaceScriptProcess,
  setWorkspaceScriptProcess,
  deleteWorkspaceScriptProcess,
  getAllWorkspaceScriptProcessKeys,
  type WorkspaceScriptProcess,
} from "./state";

// ---- Environment builder --------------------------------------------------

function buildScriptEnv(args: {
  projectPath: string;
  workspaceName: string;
  workspacePath: string;
  branch: string;
}): NodeJS.ProcessEnv {
  return {
    ...buildExecutableLookupEnv(),
    [SCRIPT_ENV_VARS.ROOT_PATH]: args.projectPath,
    [SCRIPT_ENV_VARS.WORKSPACE_NAME]: args.workspaceName,
    [SCRIPT_ENV_VARS.WORKSPACE_PATH]: args.workspacePath,
    [SCRIPT_ENV_VARS.BRANCH]: args.branch,
  };
}

// ---- Event broadcasting ---------------------------------------------------

function broadcastPhaseEvent(envelope: ScriptPhaseEventEnvelope) {
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.isDestroyed()) {
      wc.send("workspace-scripts:phase-event", envelope);
    }
  }
}

function sendEvent(
  workspaceId: string,
  phase: ScriptPhase,
  event: ScriptPhaseEvent,
) {
  broadcastPhaseEvent({ workspaceId, phase, event });
}

// ---- Process key helpers --------------------------------------------------

function processKey(workspaceId: string, phase: ScriptPhase): string {
  return `${workspaceId}:${phase}`;
}

// ---- Kill helper ----------------------------------------------------------

const SIGTERM_GRACE_MS = 5_000;

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
        // already dead
      }
      done();
    }, SIGTERM_GRACE_MS);

    // If process exits before the grace period, resolve early
    if ("on" in proc && typeof proc.on === "function") {
      // ChildProcess
      (proc as ChildProcess).once("close", () => {
        clearTimeout(timer);
        done();
      });
    } else if ("onExit" in proc && typeof proc.onExit === "function") {
      // IPty
      (proc as pty.IPty).onExit(() => {
        clearTimeout(timer);
        done();
      });
    } else {
      // Fallback: just wait for the timeout
    }
  });
}

// ---- Stop a phase ---------------------------------------------------------

export async function stopPhase(args: {
  workspaceId: string;
  phase: ScriptPhase;
}): Promise<void> {
  const key = processKey(args.workspaceId, args.phase);
  const entry = getWorkspaceScriptProcess(key);
  if (!entry) return;

  entry.aborted = true;

  if (entry.process) {
    await killProcess(entry.process);
  }

  deleteWorkspaceScriptProcess(key);
}

// ---- Execute setup/teardown (finite commands) -----------------------------

export interface RunPhaseArgs {
  workspaceId: string;
  phase: ScriptPhase;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  commands: string[];
  /** Timeout in ms for the entire phase (teardown default: 30s). */
  timeoutMs?: number;
}

/**
 * Execute a setup or teardown phase: run commands sequentially,
 * collect stdout/stderr, report events, and return overall exit code.
 */
export async function runFinitePhase(args: RunPhaseArgs): Promise<{
  ok: boolean;
  exitCode: number;
  error?: string;
}> {
  const { workspaceId, phase, commands } = args;
  const key = processKey(workspaceId, phase);

  // Stop any existing process for this workspace+phase
  await stopPhase({ workspaceId, phase });

  const env = buildScriptEnv({
    projectPath: args.projectPath,
    workspaceName: args.workspaceName,
    workspacePath: args.workspacePath,
    branch: args.branch,
  });

  const entry: WorkspaceScriptProcess = {
    type: "finite",
    process: null,
    aborted: false,
  };
  setWorkspaceScriptProcess(key, entry);

  let lastExitCode = 0;

  for (let i = 0; i < commands.length; i++) {
    if (entry.aborted) {
      deleteWorkspaceScriptProcess(key);
      return { ok: false, exitCode: -1, error: "Aborted" };
    }

    const command = commands[i];
    sendEvent(workspaceId, phase, {
      type: "started",
      commandIndex: i,
      command,
      totalCommands: commands.length,
    });

    try {
      lastExitCode = await new Promise<number>((resolve, reject) => {
        const child = spawn(command, {
          shell: true,
          cwd: args.workspacePath,
          env,
        });

        entry.process = child;

        child.stdout?.on("data", (chunk: Buffer) => {
          sendEvent(workspaceId, phase, {
            type: "output",
            data: chunk.toString(),
          });
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          sendEvent(workspaceId, phase, {
            type: "output",
            data: chunk.toString(),
          });
        });

        child.on("error", (err) => {
          reject(err);
        });

        child.on("close", (code) => {
          resolve(code ?? -1);
        });

        // Phase-level timeout
        if (args.timeoutMs) {
          setTimeout(() => {
            if (!entry.aborted) {
              entry.aborted = true;
              try {
                child.kill("SIGKILL");
              } catch {
                // already dead
              }
              reject(new Error(`Phase timed out after ${args.timeoutMs}ms`));
            }
          }, args.timeoutMs);
        }
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      sendEvent(workspaceId, phase, {
        type: "phase-error",
        error: errorMessage,
      });
      deleteWorkspaceScriptProcess(key);
      return { ok: false, exitCode: -1, error: errorMessage };
    }

    entry.process = null;

    sendEvent(workspaceId, phase, {
      type: "command-completed",
      commandIndex: i,
      exitCode: lastExitCode,
    });

    if (lastExitCode !== 0) {
      sendEvent(workspaceId, phase, {
        type: "phase-completed",
        exitCode: lastExitCode,
      });
      deleteWorkspaceScriptProcess(key);
      return { ok: false, exitCode: lastExitCode };
    }
  }

  sendEvent(workspaceId, phase, {
    type: "phase-completed",
    exitCode: 0,
  });
  deleteWorkspaceScriptProcess(key);
  return { ok: true, exitCode: 0 };
}

// ---- Execute run phase (long-running, PTY-backed) -------------------------

export interface RunLongRunningPhaseArgs {
  workspaceId: string;
  projectPath: string;
  workspacePath: string;
  workspaceName: string;
  branch: string;
  commands: string[];
}

/**
 * Execute the "run" phase.
 *
 * - Earlier commands (all but the last) run sequentially as finite commands.
 * - The **last** command spawns as a long-running PTY process that stays alive
 *   until explicitly stopped.
 *
 * Returns the PTY session ID for the long-running process.
 */
export async function runLongRunningPhase(args: RunLongRunningPhaseArgs): Promise<{
  ok: boolean;
  sessionId?: string;
  exitCode?: number;
  error?: string;
}> {
  const { workspaceId, commands } = args;
  const phase: ScriptPhase = "run";
  const key = processKey(workspaceId, phase);

  // Stop any existing run process
  await stopPhase({ workspaceId, phase });

  if (commands.length === 0) {
    return { ok: true };
  }

  const env = buildScriptEnv({
    projectPath: args.projectPath,
    workspaceName: args.workspaceName,
    workspacePath: args.workspacePath,
    branch: args.branch,
  });

  // Run all but the last command as finite
  if (commands.length > 1) {
    const prefixResult = await runFinitePhase({
      workspaceId,
      phase,
      projectPath: args.projectPath,
      workspacePath: args.workspacePath,
      workspaceName: args.workspaceName,
      branch: args.branch,
      commands: commands.slice(0, -1),
    });

    if (!prefixResult.ok) {
      return prefixResult;
    }
  }

  // Spawn the last command as a long-running PTY process
  const lastCommand = commands[commands.length - 1];
  const shellExe = process.env.SHELL || "/bin/bash";

  const ptyProcess = pty.spawn(shellExe, ["-c", lastCommand], {
    name: "xterm-color",
    cols: 120,
    rows: 30,
    cwd: args.workspacePath,
    env: env as Record<string, string>,
  });

  const sessionId = randomUUID();

  const entry: WorkspaceScriptProcess = {
    type: "long-running",
    process: ptyProcess,
    aborted: false,
    sessionId,
  };
  setWorkspaceScriptProcess(key, entry);

  sendEvent(workspaceId, phase, {
    type: "started",
    commandIndex: commands.length - 1,
    command: lastCommand,
    totalCommands: commands.length,
  });

  ptyProcess.onData((data) => {
    sendEvent(workspaceId, phase, {
      type: "output",
      data,
    });
  });

  ptyProcess.onExit(({ exitCode }) => {
    sendEvent(workspaceId, phase, {
      type: "phase-completed",
      exitCode: exitCode ?? -1,
    });
    deleteWorkspaceScriptProcess(key);
  });

  return { ok: true, sessionId };
}

// ---- Query status ---------------------------------------------------------

export interface PhaseStatus {
  phase: ScriptPhase;
  running: boolean;
  sessionId?: string;
}

export function getPhaseStatus(args: {
  workspaceId: string;
  phase: ScriptPhase;
}): PhaseStatus {
  const key = processKey(args.workspaceId, args.phase);
  const entry = getWorkspaceScriptProcess(key);
  return {
    phase: args.phase,
    running: entry !== undefined && !entry.aborted,
    sessionId: entry?.sessionId,
  };
}

export function getAllPhaseStatuses(args: {
  workspaceId: string;
}): Record<ScriptPhase, PhaseStatus> {
  return {
    setup: getPhaseStatus({ workspaceId: args.workspaceId, phase: "setup" }),
    run: getPhaseStatus({ workspaceId: args.workspaceId, phase: "run" }),
    teardown: getPhaseStatus({ workspaceId: args.workspaceId, phase: "teardown" }),
  };
}

// ---- Cleanup on app quit --------------------------------------------------

export async function cleanupAllScriptProcesses(): Promise<void> {
  const keys = getAllWorkspaceScriptProcessKeys();
  const tasks: Promise<void>[] = [];

  for (const key of keys) {
    const entry = getWorkspaceScriptProcess(key);
    if (entry?.process) {
      entry.aborted = true;
      tasks.push(killProcess(entry.process));
    }
    deleteWorkspaceScriptProcess(key);
  }

  await Promise.allSettled(tasks);
}

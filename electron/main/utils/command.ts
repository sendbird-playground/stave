import { spawn } from "node:child_process";
import path from "node:path";
import type { CommandResult, SourceControlStatusItem } from "../types";

export function resolveCommandCwd(args: { cwd?: string }) {
  if (args.cwd && path.isAbsolute(args.cwd)) {
    return args.cwd;
  }
  return process.cwd();
}

export function runCommand(args: { command: string; cwd?: string }): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const child = spawn(args.command, {
      shell: true,
      cwd: resolveCommandCwd({ cwd: args.cwd }),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: `${stderr}\n${String(error)}`.trim(),
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}

export function runCommandArgs(args: { command: string; commandArgs?: string[]; cwd?: string }): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve) => {
    const child = spawn(args.command, args.commandArgs ?? [], {
      shell: false,
      cwd: resolveCommandCwd({ cwd: args.cwd }),
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr: `${stderr}\n${String(error)}`.trim(),
      });
    });
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        code: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}

export function parseStatusLines(args: { stdout: string }): SourceControlStatusItem[] {
  return args.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      code: line.slice(0, 2).trim() || "??",
      path: line.slice(3).trim(),
    }));
}

export function hasConflictItems(args: { items: SourceControlStatusItem[] }) {
  return args.items.some((item) => {
    const code = item.code;
    return code.includes("U") || code === "AA" || code === "DD";
  });
}

export function quotePath(args: { value: string }) {
  return args.value.replaceAll('"', '\\"');
}

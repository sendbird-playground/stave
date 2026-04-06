import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

interface ResolveExecutablePathArgs {
  absolutePathEnvVar: string;
  commandEnvVar: string;
  defaultCommand: string;
  absolutePathEnvVars?: string[];
  commandEnvVars?: string[];
  explicitPaths?: string[];
  extraPaths?: string[];
}

const LOGIN_SHELL_PATH_MARKER = "__STAVE_LOGIN_SHELL_PATH__";
const LOGIN_SHELL_ENV_MARKER_PREFIX = "__STAVE_LOGIN_SHELL_ENV__";
let cachedLoginShellPath: string | null | undefined;
const cachedLoginShellEnvVarValues = new Map<string, string | null>();

function sanitizeCommandName(args: { value: string }) {
  const trimmed = args.value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function splitPathEntries(value: string | undefined) {
  return (value ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergePathEntries(values: Array<string | undefined>) {
  const unique = new Set<string>();
  for (const value of values) {
    for (const entry of splitPathEntries(value)) {
      unique.add(entry);
    }
  }
  return [...unique].join(path.delimiter);
}

function getLookupCommand() {
  return process.platform === "win32" ? "where" : "which";
}

export function canExecutePath(args: { path: string }) {
  try {
    accessSync(args.path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function parseMarkedValue(args: { value: string; marker: string }) {
  const start = args.value.indexOf(args.marker);
  if (start < 0) {
    return null;
  }
  const valueStart = start + args.marker.length;
  const end = args.value.indexOf(args.marker, valueStart);
  if (end < 0) {
    return null;
  }
  const extracted = args.value.slice(valueStart, end).trim();
  return extracted.length > 0 ? extracted : null;
}

function sanitizeEnvVarName(args: { value: string }) {
  const trimmed = args.value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^[A-Z0-9_]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function getLoginShellCandidates() {
  return [
    process.env.SHELL?.trim(),
    process.platform === "darwin" ? "/bin/zsh" : "",
    "/bin/bash",
    "/bin/sh",
  ]
    .filter(Boolean)
    .filter((candidate, index, entries) => entries.indexOf(candidate) === index)
    .filter((candidate) => canExecutePath({ path: candidate }));
}

function resolveLoginShellPath() {
  if (cachedLoginShellPath !== undefined) {
    return cachedLoginShellPath;
  }
  if (process.platform === "win32") {
    cachedLoginShellPath = null;
    return cachedLoginShellPath;
  }

  for (const shell of getLoginShellCandidates()) {
    const result = spawnSync(shell, ["-ilc", `printf '${LOGIN_SHELL_PATH_MARKER}%s${LOGIN_SHELL_PATH_MARKER}' "$PATH"`], {
      encoding: "utf8",
      env: {
        ...process.env,
        TERM: process.env.TERM || "dumb",
      },
      timeout: 4_000,
      maxBuffer: 1024 * 1024,
    });
    const parsed = parseMarkedValue({
      value: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      marker: LOGIN_SHELL_PATH_MARKER,
    });
    if (parsed) {
      cachedLoginShellPath = parsed;
      return cachedLoginShellPath;
    }
  }

  cachedLoginShellPath = null;
  return cachedLoginShellPath;
}

export function resolveLoginShellEnvVarValue(args: { key: string }) {
  const safeKey = sanitizeEnvVarName({ value: args.key });
  if (!safeKey) {
    return null;
  }
  if (cachedLoginShellEnvVarValues.has(safeKey)) {
    return cachedLoginShellEnvVarValues.get(safeKey) ?? null;
  }
  if (process.platform === "win32") {
    cachedLoginShellEnvVarValues.set(safeKey, null);
    return null;
  }

  const marker = `${LOGIN_SHELL_ENV_MARKER_PREFIX}${safeKey}__`;
  for (const shell of getLoginShellCandidates()) {
    const result = spawnSync(
      shell,
      ["-ilc", `printf '${marker}%s${marker}' "\${${safeKey}:-}"`],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TERM: process.env.TERM || "dumb",
        },
        timeout: 4_000,
        maxBuffer: 1024 * 1024,
      },
    );
    const parsed = parseMarkedValue({
      value: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
      marker,
    });
    if (parsed) {
      cachedLoginShellEnvVarValues.set(safeKey, parsed);
      return parsed;
    }
  }

  cachedLoginShellEnvVarValues.set(safeKey, null);
  return null;
}

export function resolveExecutableLookupPath(args: {
  basePath?: string;
  extraPaths?: string[];
} = {}) {
  const home = homedir();
  const commonUnixPaths = process.platform === "win32"
    ? []
    : [
        `${home}/.bun/bin`,
        `${home}/.local/bin`,
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
      ];

  return mergePathEntries([
    ...(args.extraPaths ?? []),
    args.basePath,
    resolveLoginShellPath() ?? "",
    process.env.PATH,
    ...commonUnixPaths,
  ]);
}

export function buildExecutableLookupEnv(args: {
  baseEnv?: NodeJS.ProcessEnv;
  extraPaths?: string[];
} = {}) {
  const env = { ...(args.baseEnv ?? process.env) };
  const nextPath = resolveExecutableLookupPath({
    basePath: env.PATH,
    extraPaths: args.extraPaths,
  });
  if (nextPath) {
    env.PATH = nextPath;
  }
  return env;
}

function resolveFromCommand(args: { command: string; env: NodeJS.ProcessEnv }) {
  const safeCommand = sanitizeCommandName({ value: args.command });
  if (!safeCommand) {
    return null;
  }

  const result = spawnSync(getLookupCommand(), [safeCommand], {
    encoding: "utf8",
    env: args.env,
  });

  if (result.status !== 0) {
    return null;
  }

  const resolved = result.stdout.trim().split("\n")[0]?.trim();
  if (!resolved) {
    return null;
  }
  if (!canExecutePath({ path: resolved })) {
    return null;
  }
  return resolved;
}

export function resolveExecutablePath(args: ResolveExecutablePathArgs) {
  const env = buildExecutableLookupEnv({
    extraPaths: args.extraPaths,
  });

  const explicitPaths = [
    ...(args.explicitPaths ?? []),
    process.env[args.absolutePathEnvVar]?.trim() ?? "",
    ...(args.absolutePathEnvVars ?? []).map((envVar) => process.env[envVar]?.trim() ?? ""),
  ];
  for (const candidate of explicitPaths) {
    if (candidate && canExecutePath({ path: candidate })) {
      return candidate;
    }
  }

  const commandCandidates = [
    process.env[args.commandEnvVar]?.trim() ?? "",
    ...(args.commandEnvVars ?? []).map((envVar) => process.env[envVar]?.trim() ?? ""),
  ];
  for (const commandFromEnv of commandCandidates) {
    if (!commandFromEnv) {
      continue;
    }
    const fromConfiguredCommand = resolveFromCommand({ command: commandFromEnv, env });
    if (fromConfiguredCommand) {
      return fromConfiguredCommand;
    }
  }

  return resolveFromCommand({ command: args.defaultCommand, env });
}

export function toAsarUnpackedPath(value: string) {
  return value
    .replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
    .replace("/app.asar/", "/app.asar.unpacked/")
    .replace("\\app.asar\\", "\\app.asar.unpacked\\");
}

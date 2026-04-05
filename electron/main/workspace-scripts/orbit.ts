import { createRequire } from "node:module";
import path from "node:path";
import {
  canExecutePath,
  resolveExecutablePath,
  toAsarUnpackedPath,
} from "../../providers/executable-path";
import type { ResolvedWorkspaceScriptOrbitConfig } from "../../../src/lib/workspace-scripts/types";

const require = createRequire(import.meta.url);

export const ORBIT_URL_MARKER = "__STAVE_ORBIT_URL__=";
export const DEFAULT_ORBIT_PROXY_PORT = 1355;

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

function shellAssign(name: string, value: string) {
  return `${name}=${shellQuote(value)}`;
}

export function sanitizeOrbitName(value: string | undefined) {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9.-]+/g, "-")
    .replaceAll(/(^[.-]+)|([.-]+$)/g, "")
    .replaceAll(/-{2,}/g, "-");
  return normalized || "app";
}

function resolveBundledPortlessPath() {
  try {
    const packageJsonPath = require.resolve("portless/package.json");
    const packageJson = require(packageJsonPath) as { bin?: string | Record<string, string> };
    const binRelative = typeof packageJson.bin === "string"
      ? packageJson.bin
      : packageJson.bin?.portless;
    if (!binRelative) {
      return null;
    }
    const candidate = toAsarUnpackedPath(path.resolve(path.dirname(packageJsonPath), binRelative));
    return canExecutePath({ path: candidate }) ? candidate : null;
  } catch {
    return null;
  }
}

export function resolvePortlessCommand() {
  const bundled = resolveBundledPortlessPath();
  if (bundled) {
    return bundled;
  }

  return resolveExecutablePath({
    absolutePathEnvVar: "STAVE_PORTLESS_PATH",
    commandEnvVar: "STAVE_PORTLESS_COMMAND",
    defaultCommand: "portless",
  });
}

export function buildOrbitCommand(args: {
  command: string;
  orbit: ResolvedWorkspaceScriptOrbitConfig;
  defaultName: string;
  portlessCommand: string;
}) {
  const childScript = `printf '%s%s\n' ${shellQuote(ORBIT_URL_MARKER)} "$PORTLESS_URL"; ${args.command}`;
  const proxyPort = String(args.orbit.proxyPort ?? DEFAULT_ORBIT_PROXY_PORT);
  const segments = [
    shellAssign("PORTLESS_PORT", proxyPort),
    ...(args.orbit.noTls ? [shellAssign("PORTLESS_HTTPS", "0")] : []),
    shellQuote(args.portlessCommand),
    "run",
    "--name",
    shellQuote(sanitizeOrbitName(args.orbit.name || args.defaultName)),
    "sh",
    "-lc",
    shellQuote(childScript),
  ];
  return segments.join(" ");
}

export function extractOrbitOutput(args: {
  buffer: string;
  chunk: string;
}) {
  const combined = args.buffer + args.chunk;
  const lines = combined.split(/\r?\n/);
  if (combined.endsWith("\n")) {
    lines.pop();
  }
  const nextBuffer = combined.endsWith("\n") ? "" : (lines.pop() ?? "");
  const orbitUrls: string[] = [];
  const passthroughLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(ORBIT_URL_MARKER)) {
      const url = line.slice(ORBIT_URL_MARKER.length).trim();
      if (url) {
        orbitUrls.push(url);
      }
      continue;
    }
    passthroughLines.push(line);
  }

  return {
    buffer: nextBuffer,
    orbitUrls,
    output: passthroughLines.length > 0 ? `${passthroughLines.join("\n")}\n` : "",
  };
}

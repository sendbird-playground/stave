import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { app } from "electron";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type {
  StaveLocalMcpConfig,
  StaveLocalMcpManifest,
  StaveLocalMcpRequestLog,
  StaveLocalMcpStatus,
} from "../../src/lib/local-mcp";
import {
  getStaveLocalMcpConfigPath,
  readStaveLocalMcpConfig,
  updateStaveLocalMcpConfig,
} from "./stave-mcp-config";
import { ensurePersistenceReady } from "./state";
import {
  createWorkspace,
  getTaskStatus,
  listKnownProjects,
  listTurnEvents,
  registerProject,
  respondApproval,
  respondUserInput,
  runTask,
} from "./stave-mcp-service";

let httpServer: Server | null = null;
let manifestPaths: string[] = [];
let currentManifest: StaveLocalMcpManifest | null = null;

const MAX_LOCAL_MCP_LOG_DEPTH = 6;
const MAX_LOCAL_MCP_LOG_STRING_LENGTH = 4000;
const MAX_LOCAL_MCP_LOG_ARRAY_ITEMS = 20;
const MAX_LOCAL_MCP_LOG_OBJECT_KEYS = 40;

function toStructuredResult<T>(value: T) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(value, null, 2),
    }],
    structuredContent: value,
  };
}

function resolveAuthToken(req: IncomingMessage, url: URL) {
  const authorization = req.headers.authorization?.trim() || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  const queryToken = url.searchParams.get("token")?.trim();
  return queryToken || "";
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return undefined;
  }
  return JSON.parse(text) as unknown;
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

function isSensitiveLogKey(key: string) {
  return /(authorization|token|secret|password|api[_-]?key)/i.test(key);
}

function truncateLogString(value: string) {
  if (value.length <= MAX_LOCAL_MCP_LOG_STRING_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_LOCAL_MCP_LOG_STRING_LENGTH)}…<truncated>`;
}

function sanitizeMcpLogValue(value: unknown, keyName?: string, depth = 0): unknown {
  if (keyName && isSensitiveLogKey(keyName)) {
    return "[redacted]";
  }

  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (/^bearer\s+/i.test(value.trim())) {
      return "[redacted bearer token]";
    }
    return truncateLogString(value);
  }

  if (depth >= MAX_LOCAL_MCP_LOG_DEPTH) {
    return "[truncated depth]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_LOCAL_MCP_LOG_ARRAY_ITEMS)
      .map((item) => sanitizeMcpLogValue(item, undefined, depth + 1));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record).slice(0, MAX_LOCAL_MCP_LOG_OBJECT_KEYS);
    return Object.fromEntries(entries.map(([key, nestedValue]) => [
      key,
      sanitizeMcpLogValue(nestedValue, key, depth + 1),
    ]));
  }

  return String(value);
}

function getRpcSummary(body: unknown) {
  const item = Array.isArray(body) ? body[0] : body;
  if (!item || typeof item !== "object") {
    return {
      rpcMethod: null,
      rpcRequestId: null,
      toolName: null,
    };
  }

  const record = item as Record<string, unknown>;
  const rpcMethod = typeof record.method === "string" ? record.method : null;
  const rpcRequestId = record.id == null
    ? null
    : (typeof record.id === "string" || typeof record.id === "number"
        ? String(record.id)
        : truncateLogString(JSON.stringify(sanitizeMcpLogValue(record.id))));
  const params = record.params && typeof record.params === "object"
    ? record.params as Record<string, unknown>
    : null;
  const toolName = rpcMethod === "tools/call" && params && typeof params.name === "string"
    ? params.name
    : null;

  return {
    rpcMethod,
    rpcRequestId,
    toolName,
  };
}

async function persistLocalMcpRequestLog(args: {
  httpMethod: string;
  path: string;
  body?: unknown;
  statusCode: number;
  durationMs: number;
  errorMessage?: string | null;
  createdAt?: string;
}) {
  const { rpcMethod, rpcRequestId, toolName } = getRpcSummary(args.body);
  try {
    const store = await ensurePersistenceReady();
    store.createLocalMcpRequestLog({
      log: {
        id: randomUUID(),
        httpMethod: args.httpMethod,
        path: args.path,
        rpcMethod,
        rpcRequestId,
        toolName,
        statusCode: args.statusCode,
        durationMs: Math.max(0, Math.round(args.durationMs)),
        requestPayload: args.body === undefined ? null : sanitizeMcpLogValue(args.body),
        errorMessage: args.errorMessage ?? null,
        createdAt: args.createdAt,
      },
    });
  } catch (error) {
    console.warn("[stave-mcp] failed to persist local MCP request log", error);
  }
}

export async function listStaveMcpRequestLogs(args?: {
  limit?: number;
}): Promise<StaveLocalMcpRequestLog[]> {
  const store = await ensurePersistenceReady();
  return store.listLocalMcpRequestLogs(args);
}

export async function clearStaveMcpRequestLogs() {
  const store = await ensurePersistenceReady();
  return store.clearLocalMcpRequestLogs();
}

async function writeManifest(manifest: StaveLocalMcpManifest) {
  const userDataPath = app.getPath("userData");
  const paths = [
    path.join(userDataPath, "stave-local-mcp.json"),
    path.join(homedir(), ".stave", "local-mcp.json"),
  ];

  await Promise.all(paths.map(async (manifestPath) => {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 },
    );
  }));

  manifestPaths = paths;
}

async function removeManifestFiles() {
  await Promise.all(manifestPaths.map(async (manifestPath) => {
    try {
      await fs.unlink(manifestPath);
    } catch {
      // ignore missing files
    }
  }));
  manifestPaths = [];
}

function createToolServer() {
  const server = new McpServer({
    name: "stave-local-mcp",
    version: app.getVersion(),
  });

  server.registerTool("stave_list_projects", {
    description: "List projects already registered in the local Stave desktop app.",
  }, async () => toStructuredResult({
    projects: await listKnownProjects(),
  }));

  server.registerTool("stave_register_project", {
    description: "Register or refresh a local project in Stave and ensure its default workspace exists.",
    inputSchema: {
      projectPath: z.string().min(1).describe("Absolute or user-resolvable path to the repository root."),
      projectName: z.string().optional().describe("Optional display name override."),
      defaultBranch: z.string().optional().describe("Optional default branch override."),
    },
  }, async ({ projectPath, projectName, defaultBranch }) => toStructuredResult({
    project: await registerProject({
      projectPath,
      projectName,
      defaultBranch,
    }),
  }));

  server.registerTool("stave_create_workspace", {
    description: "Create a git-worktree-backed workspace inside a registered Stave project.",
    inputSchema: {
      projectPath: z.string().min(1).describe("Project root path."),
      name: z.string().min(1).describe("Workspace display name. Also used to derive the branch name."),
      mode: z.enum(["branch", "clean"]).default("branch").describe("`branch` creates from the base branch. `clean` creates a new empty branch worktree."),
      fromBranch: z.string().optional().describe("Base branch to branch from when mode is `branch`."),
      initCommand: z.string().optional().describe("Optional post-create command to run inside the new workspace."),
      useRootNodeModulesSymlink: z.boolean().optional().describe("Whether to link the root node_modules into the new workspace."),
    },
  }, async (input) => toStructuredResult({
    workspace: await createWorkspace(input),
  }));

  server.registerTool("stave_run_task", {
    description: "Create or continue a task in a workspace and start a provider turn for the given prompt.",
    inputSchema: {
      workspaceId: z.string().min(1).describe("Target workspace id."),
      prompt: z.string().min(1).describe("User prompt to run inside the workspace."),
      taskId: z.string().optional().describe("Existing task id to continue."),
      title: z.string().optional().describe("Optional title when creating a new task."),
      provider: z.enum(["claude-code", "codex", "stave"]).optional().describe("Provider to run. Defaults to `stave`."),
      runtimeOptions: z.record(z.string(), z.unknown()).optional().describe("Optional provider runtime overrides."),
    },
  }, async ({ workspaceId, prompt, taskId, title, provider, runtimeOptions }) => toStructuredResult({
    run: await runTask({
      workspaceId,
      prompt,
      taskId,
      title,
      provider,
      runtimeOptions: runtimeOptions as never,
    }),
  }));

  server.registerTool("stave_get_task", {
    description: "Read the current persisted task state from Stave.",
    inputSchema: {
      workspaceId: z.string().min(1).describe("Workspace id."),
      taskId: z.string().min(1).describe("Task id."),
    },
  }, async ({ workspaceId, taskId }) => toStructuredResult({
    task: await getTaskStatus({
      workspaceId,
      taskId,
    }),
  }));

  server.registerTool("stave_list_turn_events", {
    description: "List persisted turn events for a Stave task run.",
    inputSchema: {
      turnId: z.string().min(1).describe("Turn id."),
      afterSequence: z.number().int().nonnegative().optional().describe("Optional lower sequence bound."),
      limit: z.number().int().positive().max(5000).optional().describe("Max number of events to return."),
    },
  }, async ({ turnId, afterSequence, limit }) => toStructuredResult({
    turnId,
    events: await listTurnEvents({
      turnId,
      afterSequence,
      limit,
    }),
  }));

  server.registerTool("stave_respond_approval", {
    description: "Respond to a pending approval request emitted by a running task.",
    inputSchema: {
      workspaceId: z.string().min(1).describe("Workspace id."),
      taskId: z.string().min(1).describe("Task id."),
      requestId: z.string().min(1).describe("Approval request id."),
      approved: z.boolean().describe("Whether to approve the request."),
    },
  }, async ({ workspaceId, taskId, requestId, approved }) => toStructuredResult({
    result: await respondApproval({
      workspaceId,
      taskId,
      requestId,
      approved,
    }),
  }));

  server.registerTool("stave_respond_user_input", {
    description: "Respond to a pending user-input request emitted by a running task.",
    inputSchema: {
      workspaceId: z.string().min(1).describe("Workspace id."),
      taskId: z.string().min(1).describe("Task id."),
      requestId: z.string().min(1).describe("User-input request id."),
      answers: z.record(z.string(), z.string()).optional().describe("Answer map keyed by question id."),
      denied: z.boolean().optional().describe("Mark the request as denied instead of answered."),
    },
  }, async ({ workspaceId, taskId, requestId, answers, denied }) => toStructuredResult({
    result: await respondUserInput({
      workspaceId,
      taskId,
      requestId,
      answers,
      denied,
    }),
  }));

  return server;
}

export async function startStaveMcpServer() {
  if (httpServer) {
    return;
  }

  const config = await readStaveLocalMcpConfig();
  if (!config.enabled) {
    currentManifest = null;
    await removeManifestFiles();
    console.log("[stave-mcp] local MCP server disabled in settings");
    return;
  }

  const host = "127.0.0.1";
  const requestedPort = config.port;
  const token = config.token || randomUUID();

  const nextServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    const startedAt = Date.now();
    const createdAt = new Date().toISOString();

    if (url.pathname === "/health") {
      writeJson(res, 200, {
        ok: true,
        service: "stave-local-mcp",
        pid: process.pid,
        version: app.getVersion(),
      });
      return;
    }

    if (url.pathname !== "/mcp") {
      writeJson(res, 404, { ok: false, message: "Not found." });
      return;
    }

    if (resolveAuthToken(req, url) !== token) {
      writeJson(res, 401, { ok: false, message: "Unauthorized." });
      await persistLocalMcpRequestLog({
        httpMethod: req.method ?? "GET",
        path: url.pathname,
        statusCode: 401,
        errorMessage: "Unauthorized.",
        createdAt,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    try {
      const body = req.method === "POST" ? await readJsonBody(req) : undefined;
      const server = createToolServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      await server.connect(transport);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await transport.handleRequest(req, res, body);
      await persistLocalMcpRequestLog({
        httpMethod: req.method ?? "GET",
        path: url.pathname,
        body,
        statusCode: res.statusCode || 200,
        createdAt,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      console.error("[stave-mcp] request failed", error);
      if (!res.headersSent) {
        writeJson(res, 500, {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: `Internal server error: ${String(error)}`,
          },
          id: null,
        });
      }
      await persistLocalMcpRequestLog({
        httpMethod: req.method ?? "GET",
        path: url.pathname,
        statusCode: res.statusCode || 500,
        errorMessage: error instanceof Error ? error.message : String(error),
        createdAt,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  try {
    await new Promise<void>((resolve, reject) => {
      nextServer.once("error", reject);
      nextServer.listen({
        host,
        port: Number.isFinite(requestedPort) ? requestedPort : 0,
      }, () => {
        nextServer.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    nextServer.close();
    throw error;
  }

  httpServer = nextServer;

  const address = nextServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve local MCP server address.");
  }

  const manifest: StaveLocalMcpManifest = {
    version: 1,
    name: "stave-local-mcp",
    mode: "local-only",
    url: `http://${host}:${address.port}/mcp`,
    healthUrl: `http://${host}:${address.port}/health`,
    token,
    host,
    port: address.port,
    pid: process.pid,
    appVersion: app.getVersion(),
    startedAt: new Date().toISOString(),
  };

  await writeManifest(manifest);
  currentManifest = manifest;
  console.log("[stave-mcp] listening", {
    url: manifest.url,
    manifestPaths,
  });
}

export async function stopStaveMcpServer() {
  const currentServer = httpServer;
  httpServer = null;
  currentManifest = null;
  await removeManifestFiles();
  if (!currentServer) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    currentServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function restartStaveMcpServer() {
  await stopStaveMcpServer();
  await startStaveMcpServer();
}

export async function getStaveMcpServerStatus(): Promise<StaveLocalMcpStatus> {
  const config = await readStaveLocalMcpConfig();
  return {
    config,
    running: Boolean(httpServer && currentManifest),
    manifest: currentManifest,
    manifestPaths: [...manifestPaths],
    configPath: getStaveLocalMcpConfigPath(),
  };
}

export async function updateStaveMcpServerConfig(patch: Partial<StaveLocalMcpConfig>) {
  await updateStaveLocalMcpConfig(patch);
  await restartStaveMcpServer();
  return getStaveMcpServerStatus();
}

export async function rotateStaveMcpToken() {
  await updateStaveLocalMcpConfig({ token: randomUUID() });
  await restartStaveMcpServer();
  return getStaveMcpServerStatus();
}

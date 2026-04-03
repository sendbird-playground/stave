import { afterEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

async function waitForServerListening(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

describe("stave-mcp-stdio-proxy", () => {
  const cleanupPaths: string[] = [];
  const cleanupServers: Server[] = [];

  afterEach(async () => {
    await Promise.all(cleanupServers.splice(0).map((server) =>
      new Promise<void>((resolve) => server.close(() => resolve()))
    ));
    await Promise.all(cleanupPaths.splice(0).map((target) => rm(target, { recursive: true, force: true })));
  });

  test("forwards MCP requests with the required accept header and flushes before exit", async () => {
    let seenAcceptHeader = "";
    let seenAuthorizationHeader = "";
    let seenRequestBody = "";

    const server = createServer(async (req, res) => {
      seenAcceptHeader = req.headers.accept ?? "";
      seenAuthorizationHeader = req.headers.authorization ?? "";

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      seenRequestBody = Buffer.concat(chunks).toString("utf8");

      await new Promise((resolve) => setTimeout(resolve, 25));

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          ok: true,
        },
      }));
    });

    cleanupServers.push(server);
    await waitForServerListening(server);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve test server address.");
    }

    const tempHome = await mkdtemp(path.join(tmpdir(), "stave-mcp-proxy-"));
    cleanupPaths.push(tempHome);
    await mkdir(path.join(tempHome, ".stave"), { recursive: true });
    await writeFile(
      path.join(tempHome, ".stave", "local-mcp.json"),
      `${JSON.stringify({
        url: `http://127.0.0.1:${address.port}/mcp`,
        token: "test-token",
      })}\n`,
    );

    const child = spawn(process.execPath, ["electron/main/stave-mcp-stdio-proxy.ts"], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        HOME: tempHome,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new Error("Failed to open stdio for proxy process.");
    }

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "0",
        },
      },
    })}\n`);
    child.stdin.end();

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });

    expect(exitCode).toBe(0);
    expect(seenAuthorizationHeader).toBe("Bearer test-token");
    expect(seenAcceptHeader).toContain("application/json");
    expect(seenAcceptHeader).toContain("text/event-stream");
    expect(JSON.parse(seenRequestBody)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: {
          name: "test-client",
          version: "0",
        },
      },
    });
    expect(stdout.trim()).toBe(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: {
        ok: true,
      },
    }));
    expect(stderr).toContain("connected");
    expect(stderr).toContain("stdin closed, exiting.");
  });
});

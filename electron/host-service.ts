import { createInterface } from "node:readline";
import {
  cleanupAllScriptProcesses,
  getScriptStatuses,
  runScriptEntry,
  runScriptHook,
  setWorkspaceScriptEventListener,
  stopAllWorkspaceScriptProcesses,
  stopScriptEntry,
} from "./main/workspace-scripts";
import { createTerminalRuntime } from "./host-service/terminal-runtime";
import type {
  AnyHostServiceRequestEnvelope,
  AnyHostServiceResponseEnvelope,
  HostServiceEventMap,
  HostServiceEventName,
  HostServiceMethod,
  HostServiceResponseMap,
  HostServiceSuccessResponseEnvelope,
} from "./host-service/protocol";

function writeMessage(message: AnyHostServiceResponseEnvelope | {
  type: "ready";
} | {
  type: "event";
  event: HostServiceEventName;
  payload: HostServiceEventMap[HostServiceEventName];
}) {
  return new Promise<void>((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(message)}\n`, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function emitEvent<TEvent extends HostServiceEventName>(
  event: TEvent,
  payload: HostServiceEventMap[TEvent],
) {
  void writeMessage({
    type: "event",
    event,
    payload,
  }).catch((error) => {
    process.stderr.write(`[host-service] failed to emit ${event}: ${String(error)}\n`);
  });
}

const terminalRuntime = createTerminalRuntime({ emitEvent });
setWorkspaceScriptEventListener((envelope) => {
  emitEvent("workspace-scripts.event", envelope);
});

async function respond<TMethod extends HostServiceMethod>(
  id: number,
  result: HostServiceResponseMap[TMethod],
) {
  const response: HostServiceSuccessResponseEnvelope<TMethod> = {
    type: "response",
    id,
    ok: true,
    result,
  };
  await writeMessage(response);
}

async function respondError(id: number, error: unknown) {
  await writeMessage({
    type: "response",
    id,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

async function shutdown() {
  setWorkspaceScriptEventListener(null);
  await Promise.allSettled([
    terminalRuntime.cleanupAll(),
    cleanupAllScriptProcesses(),
  ]);
}

async function handleRequest(request: AnyHostServiceRequestEnvelope) {
  switch (request.method) {
    case "service.shutdown":
      await shutdown();
      await respond(request.id, { ok: true });
      setImmediate(() => process.exit(0));
      return;
    case "terminal.create-session":
      await respond(
        request.id,
        terminalRuntime.createSession(request.params),
      );
      return;
    case "terminal.create-cli-session":
      await respond(
        request.id,
        terminalRuntime.createCliSession(request.params),
      );
      return;
    case "terminal.write-session":
      await respond(
        request.id,
        terminalRuntime.writeSession(request.params),
      );
      return;
    case "terminal.read-session":
      await respond(
        request.id,
        terminalRuntime.readSession(request.params),
      );
      return;
    case "terminal.set-session-delivery-mode":
      await respond(
        request.id,
        terminalRuntime.setSessionDeliveryMode(request.params),
      );
      return;
    case "terminal.resize-session":
      await respond(
        request.id,
        terminalRuntime.resizeSession(request.params),
      );
      return;
    case "terminal.close-session":
      await respond(
        request.id,
        terminalRuntime.closeSession(request.params),
      );
      return;
    case "terminal.buffer-session-output":
      await respond(
        request.id,
        terminalRuntime.bufferSessionOutput(request.params),
      );
      return;
    case "terminal.cleanup-all":
      await terminalRuntime.cleanupAll();
      await respond(request.id, { ok: true });
      return;
    case "workspace-scripts.run-entry":
      await respond(
        request.id,
        await runScriptEntry(request.params),
      );
      return;
    case "workspace-scripts.run-hook":
      await respond(request.id, {
        ok: true,
        summary: await runScriptHook(request.params),
      });
      return;
    case "workspace-scripts.stop-entry":
      await stopScriptEntry(request.params);
      await respond(request.id, { ok: true });
      return;
    case "workspace-scripts.stop-all":
      await stopAllWorkspaceScriptProcesses(request.params);
      await respond(request.id, { ok: true });
      return;
    case "workspace-scripts.get-status":
      await respond(request.id, {
        statuses: getScriptStatuses(request.params),
      });
      return;
    case "workspace-scripts.cleanup-all":
      await cleanupAllScriptProcesses();
      await respond(request.id, { ok: true });
      return;
    default:
      request satisfies never;
  }
}

async function main() {
  await writeMessage({ type: "ready" });
  const rl = createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    void (async () => {
      let request: AnyHostServiceRequestEnvelope;
      try {
        request = JSON.parse(trimmed) as AnyHostServiceRequestEnvelope;
      } catch {
        return;
      }
      if (request.type !== "request") {
        return;
      }
      try {
        await handleRequest(request);
      } catch (error) {
        await respondError(request.id, error);
      }
    })();
  });

  rl.on("close", () => {
    void shutdown()
      .catch((error) => {
        process.stderr.write(`[host-service] shutdown error: ${String(error)}\n`);
      })
      .finally(() => {
        process.exit(0);
      });
  });
}

void main().catch((error) => {
  process.stderr.write(`[host-service] ${String(error)}\n`);
  process.exit(1);
});

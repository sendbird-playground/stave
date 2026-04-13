import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { byteLengthUtf8 } from "../shared/bounded-text";
import type {
  AnyHostServiceEventEnvelope,
  AnyHostServiceMessage,
  AnyHostServiceResponseEnvelope,
  HostServiceEventMap,
  HostServiceMethod,
  HostServiceRequestEnvelope,
  HostServiceRequestMap,
  HostServiceResponseMap,
} from "../host-service/protocol";

interface PendingRequest {
  method: HostServiceMethod;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

const HOST_SERVICE_STDOUT_BUFFER_MAX_BYTES = 2 * 1024 * 1024;
const HOST_SERVICE_STDOUT_LINE_MAX_BYTES = 1 * 1024 * 1024;

export function resolveHostServiceScriptPath(args: {
  moduleUrl: string;
  pathExists?: (path: string) => boolean;
}) {
  const pathExists = args.pathExists ?? existsSync;
  const modulePath = fileURLToPath(args.moduleUrl);
  const moduleDir = path.dirname(modulePath);
  const siblingCandidate = path.join(moduleDir, "host-service.js");
  if (pathExists(siblingCandidate)) {
    return siblingCandidate;
  }
  const parentCandidate = path.join(moduleDir, "..", "host-service.js");
  if (pathExists(parentCandidate)) {
    return path.normalize(parentCandidate);
  }
  return siblingCandidate;
}

class HostServiceClient {
  private child: ChildProcessWithoutNullStreams | null = null;

  private startupPromise: Promise<void> | null = null;

  private startupResolve: (() => void) | null = null;

  private startupReject: ((reason?: unknown) => void) | null = null;

  private stdoutBuffer = "";

  private nextRequestId = 1;

  private pending = new Map<number, PendingRequest>();

  private eventListeners = new Set<
    (event: AnyHostServiceEventEnvelope) => void
  >();

  private getScriptPath() {
    return resolveHostServiceScriptPath({ moduleUrl: import.meta.url });
  }

  private resetStartupState() {
    this.startupPromise = null;
    this.startupResolve = null;
    this.startupReject = null;
  }

  private failChild(args: {
    child: ChildProcessWithoutNullStreams | null;
    error: Error;
  }) {
    if (args.child && this.child && this.child !== args.child) {
      return;
    }

    const activeChild = args.child ?? this.child;
    this.child = null;
    this.stdoutBuffer = "";
    this.startupReject?.(args.error);
    this.resetStartupState();
    for (const pending of this.pending.values()) {
      pending.reject(args.error);
    }
    this.pending.clear();

    if (activeChild && activeChild.exitCode === null) {
      activeChild.kill();
    }
  }

  private handleResponse(message: AnyHostServiceResponseEnvelope) {
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    this.pending.delete(message.id);
    if (message.ok) {
      pending.resolve(message.result);
      return;
    }
    pending.reject(
      new Error(`[host-service] ${pending.method} failed: ${message.error}`),
    );
  }

  private handleEvent(message: AnyHostServiceEventEnvelope) {
    for (const listener of this.eventListeners) {
      listener(message);
    }
  }

  private handleMessage(raw: string) {
    let message: AnyHostServiceMessage;
    try {
      message = JSON.parse(raw) as AnyHostServiceMessage;
    } catch {
      return;
    }
    if (message.type === "ready") {
      this.startupResolve?.();
      this.resetStartupState();
      return;
    }
    if (message.type === "response") {
      this.handleResponse(message);
      return;
    }
    if (message.type === "event") {
      this.handleEvent(message);
    }
  }

  private attachChild(child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      this.stdoutBuffer += chunk;
      if (byteLengthUtf8(this.stdoutBuffer) > HOST_SERVICE_STDOUT_BUFFER_MAX_BYTES) {
        this.failChild({
          child,
          error: new Error(
            `[host-service] protocol overflow: stdout buffer exceeded ${HOST_SERVICE_STDOUT_BUFFER_MAX_BYTES} bytes`,
          ),
        });
        return;
      }
      let newlineIndex = this.stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const rawLine = this.stdoutBuffer.slice(0, newlineIndex);
        this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
        const line = rawLine.endsWith("\r")
          ? rawLine.slice(0, -1)
          : rawLine;
        if (byteLengthUtf8(line) > HOST_SERVICE_STDOUT_LINE_MAX_BYTES) {
          this.failChild({
            child,
            error: new Error(
              `[host-service] protocol overflow: line exceeded ${HOST_SERVICE_STDOUT_LINE_MAX_BYTES} bytes`,
            ),
          });
          return;
        }
        if (line.length > 0) {
          this.handleMessage(line);
        }
        newlineIndex = this.stdoutBuffer.indexOf("\n");
      }
    });

    child.stderr.setEncoding("utf8");
    if (process.env.STAVE_DEV) {
      child.stderr.on("data", (chunk: string) => {
        const text = chunk.trim();
        if (text) {
          console.error(`[host-service] ${text}`);
        }
      });
    } else {
      child.stderr.resume();
    }

    child.on("exit", (code, signal) => {
      this.failChild({
        child,
        error: new Error(
          `[host-service] exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        ),
      });
    });
  }

  async ensureStarted() {
    if (this.child && this.child.exitCode === null) {
      return;
    }
    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = new Promise<void>((resolve, reject) => {
      this.startupResolve = resolve;
      this.startupReject = reject;
    });

    const child = spawn(process.execPath, [this.getScriptPath()], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child = child;
    this.attachChild(child);
    return this.startupPromise;
  }

  async invoke<TMethod extends HostServiceMethod>(
    method: TMethod,
    params: HostServiceRequestMap[TMethod],
  ): Promise<HostServiceResponseMap[TMethod]> {
    await this.ensureStarted();
    if (
      !this.child ||
      this.child.exitCode !== null ||
      !this.child.stdin.writable
    ) {
      throw new Error("[host-service] child process is not available");
    }

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const request: HostServiceRequestEnvelope<TMethod> = {
      type: "request",
      id: requestId,
      method,
      params,
    };

    const resultPromise = new Promise<HostServiceResponseMap[TMethod]>(
      (resolve, reject) => {
        this.pending.set(requestId, {
          method,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
      },
    );

    this.child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
      if (!error) {
        return;
      }
      const pending = this.pending.get(requestId);
      if (!pending) {
        return;
      }
      this.pending.delete(requestId);
      pending.reject(error);
    });

    return resultPromise;
  }

  onEvent(listener: (event: AnyHostServiceEventEnvelope) => void) {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  async stop() {
    const child = this.child;
    if (!child || child.exitCode !== null) {
      this.child = null;
      this.resetStartupState();
      return;
    }

    try {
      await this.invoke("service.shutdown", undefined);
    } catch {
      child.kill();
    }

    await Promise.race([
      new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          child.kill();
          resolve();
        }, 5_000);
      }),
    ]);
  }
}

const hostServiceClient = new HostServiceClient();

export function startHostService() {
  return hostServiceClient.ensureStarted();
}

export function stopHostService() {
  return hostServiceClient.stop();
}

export function invokeHostService<TMethod extends HostServiceMethod>(
  method: TMethod,
  params: HostServiceRequestMap[TMethod],
) {
  return hostServiceClient.invoke(method, params);
}

export function onHostServiceEvent<TEvent extends keyof HostServiceEventMap>(
  eventName: TEvent,
  listener: (payload: HostServiceEventMap[TEvent]) => void,
) {
  return hostServiceClient.onEvent((event) => {
    if (event.event === eventName) {
      listener(event.payload as HostServiceEventMap[TEvent]);
    }
  });
}

import { afterEach, describe, expect, mock, test } from "bun:test";

type ExitPayload = { exitCode: number; signal?: number };

class FakeDisposable {
  disposed = false;

  dispose() {
    this.disposed = true;
  }
}

class FakePty {
  destroyed = false;
  killed = false;
  dataListeners: Array<{ listener: (data: string) => void; disposable: FakeDisposable }> = [];
  exitListeners: Array<{ listener: (event: ExitPayload) => void; disposable: FakeDisposable }> = [];

  onData(listener: (data: string) => void) {
    const disposable = new FakeDisposable();
    this.dataListeners.push({ listener, disposable });
    return disposable;
  }

  onExit(listener: (event: ExitPayload) => void) {
    const disposable = new FakeDisposable();
    this.exitListeners.push({ listener, disposable });
    return disposable;
  }

  write(_input: string) {}

  resize(_cols: number, _rows: number) {}

  kill() {
    this.killed = true;
  }

  destroy() {
    this.destroyed = true;
  }

  fireData(data: string) {
    for (const entry of this.dataListeners) {
      if (!entry.disposable.disposed) {
        entry.listener(data);
      }
    }
  }

  fireExit(event: ExitPayload) {
    for (const entry of this.exitListeners) {
      if (!entry.disposable.disposed) {
        entry.listener(event);
      }
    }
  }
}

const fakePtys: FakePty[] = [];

mock.module("node-pty", () => ({
  spawn: () => {
    const fake = new FakePty();
    fakePtys.push(fake);
    return fake;
  },
}));

const { createTerminalRuntime } = await import("../electron/host-service/terminal-runtime");

afterEach(() => {
  fakePtys.length = 0;
});

describe("terminal runtime PTY cleanup", () => {
  test("closeSession disposes PTY listeners before destroying the PTY", () => {
    const emitted: Array<{ event: string; payload: unknown }> = [];
    const runtime = createTerminalRuntime({
      emitEvent: async (event, payload) => {
        emitted.push({ event, payload });
      },
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    expect(created.sessionId).toBeTruthy();

    const fake = fakePtys[0];
    expect(fake).toBeTruthy();

    const result = runtime.closeSession({ sessionId: created.sessionId! });
    expect(result).toEqual({ ok: true });
    expect(fake.destroyed).toBe(true);
    expect(fake.dataListeners.every((entry) => entry.disposable.disposed)).toBe(true);
    expect(fake.exitListeners.every((entry) => entry.disposable.disposed)).toBe(true);

    fake.fireData("late output");
    fake.fireExit({ exitCode: 0 });
    expect(emitted).toEqual([]);
  });
});

describe("terminal runtime slot lifecycle", () => {
  test("reuses the existing PTY for the same terminal slot", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const args = {
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push" as const,
    };

    const first = runtime.createSession(args);
    const second = runtime.createSession(args);

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: true,
      sessionId: first.sessionId,
    });
    expect(fakePtys).toHaveLength(1);
  });

  test("restores detached terminal backlog when the same slot reattaches", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    const sessionId = created.sessionId!;
    const slotKey = "terminal:workspace-1:tab-1";
    const fake = fakePtys[0]!;

    expect(runtime.detachSession({ sessionId })).toEqual({ ok: true });

    fake.fireData("while detached\r\n");

    expect(runtime.getSlotState({ slotKey })).toEqual({
      state: "background",
      sessionId,
    });
    expect(
      runtime.attachSession({ sessionId, deliveryMode: "push" }),
    ).toEqual({
      ok: true,
      backlog: "while detached\r\n",
    });
    expect(runtime.getSlotState({ slotKey })).toEqual({
      state: "running",
      sessionId,
    });
  });

  test("preserves exited slot state for background sessions until the slot is recreated", () => {
    const runtime = createTerminalRuntime({
      emitEvent: async () => {},
    });

    const created = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(created.ok).toBe(true);
    const sessionId = created.sessionId!;
    const slotKey = "terminal:workspace-1:tab-1";
    const fake = fakePtys[0]!;

    expect(runtime.detachSession({ sessionId })).toEqual({ ok: true });

    fake.fireExit({ exitCode: 0 });

    expect(runtime.getSlotState({ slotKey })).toEqual({
      state: "exited",
      exitCode: 0,
      signal: undefined,
    });

    const recreated = runtime.createSession({
      workspaceId: "workspace-1",
      workspacePath: "/tmp/workspace",
      taskId: null,
      taskTitle: null,
      terminalTabId: "tab-1",
      cwd: "/tmp/workspace",
      deliveryMode: "push",
    });

    expect(recreated.ok).toBe(true);
    expect(recreated.sessionId).not.toBe(sessionId);
    expect(fakePtys).toHaveLength(2);
    expect(runtime.getSlotState({ slotKey })).toEqual({
      state: "running",
      sessionId: recreated.sessionId,
    });
  });
});

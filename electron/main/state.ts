import { app } from "electron";
import path from "node:path";
import { disposeAllLspSessions } from "./lsp/session-manager";
import { destroyAllBrowserSessions } from "./browser/browser-manager";
import { SqliteStore } from "../persistence/sqlite-store";
import type { TerminalSession } from "./types";

const terminalSessions = new Map<string, TerminalSession>();
let sqliteStore: SqliteStore | null = null;
const TERMINAL_SESSION_CLOSE_TIMEOUT_MS = 5_000;

export function getTerminalSession(sessionId: string) {
  return terminalSessions.get(sessionId);
}

export function setTerminalSession(sessionId: string, session: TerminalSession) {
  terminalSessions.set(sessionId, session);
}

export function deleteTerminalSession(sessionId: string) {
  terminalSessions.delete(sessionId);
}

function waitForTerminalSessionClose(session: TerminalSession) {
  return Promise.race([
    session.closed,
    new Promise<void>((resolve) => {
      setTimeout(resolve, TERMINAL_SESSION_CLOSE_TIMEOUT_MS);
    }),
  ]);
}

export async function cleanupAllTerminalSessions() {
  const sessions = [...terminalSessions.values()];
  terminalSessions.clear();

  await Promise.allSettled(
    sessions.map(async (session) => {
      session.close();
      await waitForTerminalSessionClose(session);
    }),
  );
}

export async function ensurePersistenceReady() {
  if (sqliteStore) {
    return sqliteStore;
  }
  const dbPath = path.join(app.getPath("userData"), "stave.sqlite");
  sqliteStore = new SqliteStore({ dbPath });
  return sqliteStore;
}

export function ensurePersistenceReadySync() {
  if (sqliteStore) {
    return sqliteStore;
  }
  const dbPath = path.join(app.getPath("userData"), "stave.sqlite");
  sqliteStore = new SqliteStore({ dbPath });
  return sqliteStore;
}

export function resetMainProcessState() {
  terminalSessions.clear();
  void disposeAllLspSessions();
  destroyAllBrowserSessions();
  sqliteStore = null;
}

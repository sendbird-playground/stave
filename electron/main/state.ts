import { app } from "electron";
import path from "node:path";
import { disposeAllLspSessions } from "./lsp/session-manager";
import { SqliteStore } from "../persistence/sqlite-store";
import { RepoMapContextCache } from "./utils/repo-map-context-cache";
import type { TerminalSession } from "./types";

const terminalSessions = new Map<string, TerminalSession>();
let sqliteStore: SqliteStore | null = null;
let repoMapContextCache: RepoMapContextCache | null = null;

export function getTerminalSession(sessionId: string) {
  return terminalSessions.get(sessionId);
}

export function setTerminalSession(sessionId: string, session: TerminalSession) {
  terminalSessions.set(sessionId, session);
}

export function deleteTerminalSession(sessionId: string) {
  terminalSessions.delete(sessionId);
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

export function ensureRepoMapContextCacheReady() {
  if (repoMapContextCache) {
    return repoMapContextCache;
  }
  const cacheDir = path.join(app.getPath("userData"), "repo-map-cache");
  repoMapContextCache = new RepoMapContextCache({ cacheDir });
  return repoMapContextCache;
}

export function resetMainProcessState() {
  void disposeAllLspSessions();
  if (repoMapContextCache) {
    void repoMapContextCache.close();
    repoMapContextCache = null;
  }
  sqliteStore = null;
}

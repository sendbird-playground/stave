import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { open, type RootDatabase, type Database } from "lmdb";
import { formatRepoMapForContext, REPO_MAP_MAX_AGE_MS, type RepoMapContextResponse, type RepoMapSnapshot } from "../../../src/lib/fs/repo-map.types";
import { getOrCreateRepoMap } from "./repo-map";

const execFileAsync = promisify(execFile);
const CONTEXT_CACHE_VERSION = 1;
const DEFAULT_MEMORY_ENTRY_LIMIT = 12;

interface RepoMapWorkspacePointer {
  cacheKey: string;
  updatedAt: string;
  accessedAt: string;
}

interface RepoMapContextCacheEntry {
  version: number;
  cacheKey: string;
  stableKey: string;
  workspacePath: string;
  repoRoot: string;
  worktreePath: string;
  headSha: string | null;
  dirtyFingerprint: string;
  configHash: string;
  updatedAt: string;
  lastAccessedAt: string;
  repoMapSource: "cache" | "generated";
  repoMap: RepoMapSnapshot;
  contextText: string;
}

export interface RepoMapContextIdentity {
  cacheKey: string;
  stableKey: string;
  workspacePath: string;
  repoRoot: string;
  worktreePath: string;
  headSha: string | null;
  dirtyFingerprint: string;
  configHash: string;
}

interface RepoMapContextCacheDeps {
  getOrCreateRepoMap?: typeof getOrCreateRepoMap;
  now?: () => number;
  resolveIdentity?: (rootPath: string) => Promise<RepoMapContextIdentity>;
}

function normalizePath(value: string) {
  return path.resolve(value).replaceAll("\\", "/");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function runGit(rootPath: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: rootPath,
      encoding: "utf8",
    });
    const value = stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

async function readConfigHash(rootPath: string) {
  const configPath = path.join(rootPath, ".stave", "repo-map.config.json");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return sha256(`${CONTEXT_CACHE_VERSION}|${raw}`);
  } catch {
    return sha256(`${CONTEXT_CACHE_VERSION}|missing`);
  }
}

export async function resolveRepoMapContextIdentity(rootPath: string): Promise<RepoMapContextIdentity> {
  const workspacePath = normalizePath(rootPath);
  const [repoRootRaw, headSha, gitStatus, configHash] = await Promise.all([
    runGit(workspacePath, ["rev-parse", "--show-toplevel"]),
    runGit(workspacePath, ["rev-parse", "HEAD"]),
    runGit(workspacePath, ["status", "--porcelain", "--untracked-files=normal"]),
    readConfigHash(workspacePath),
  ]);

  const repoRoot = normalizePath(repoRootRaw ?? workspacePath);
  const worktreePath = workspacePath;
  const dirtyFingerprint = sha256(gitStatus ?? "no-git-status");
  const stableKey = sha256([
    repoRoot,
    worktreePath,
    headSha ?? "no-git",
    configHash,
    `repo-map-context-v${CONTEXT_CACHE_VERSION}`,
  ].join("|"));
  const cacheKey = sha256([stableKey, dirtyFingerprint].join("|"));

  return {
    cacheKey,
    stableKey,
    workspacePath,
    repoRoot,
    worktreePath,
    headSha,
    dirtyFingerprint,
    configHash,
  };
}

export class RepoMapContextCache {
  private readonly rootDb: RootDatabase;
  private readonly entriesDb: Database<RepoMapContextCacheEntry, string>;
  private readonly workspaceLatestDb: Database<RepoMapWorkspacePointer, string>;
  private readonly memoryEntries = new Map<string, RepoMapContextCacheEntry>();
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly loadRepoMap: typeof getOrCreateRepoMap;
  private readonly resolveIdentity: (rootPath: string) => Promise<RepoMapContextIdentity>;
  private readonly inFlight = new Map<string, Promise<RepoMapContextResponse>>();

  constructor(args: { cacheDir: string; maxEntries?: number } & RepoMapContextCacheDeps) {
    this.rootDb = open({
      path: args.cacheDir,
      compression: true,
      maxDbs: 8,
    });
    this.entriesDb = this.rootDb.openDB<RepoMapContextCacheEntry, string>({
      name: "repoMapContextEntries",
    });
    this.workspaceLatestDb = this.rootDb.openDB<RepoMapWorkspacePointer, string>({
      name: "repoMapWorkspaceLatest",
    });
    this.maxEntries = args.maxEntries ?? DEFAULT_MEMORY_ENTRY_LIMIT;
    this.now = args.now ?? Date.now;
    this.loadRepoMap = args.getOrCreateRepoMap ?? getOrCreateRepoMap;
    this.resolveIdentity = args.resolveIdentity ?? resolveRepoMapContextIdentity;
  }

  async close() {
    await this.rootDb.close();
  }

  getCachedContextSync(args: { rootPath: string; maxAgeMs?: number }): RepoMapContextResponse {
    const workspacePath = normalizePath(args.rootPath);
    const maxAgeMs = args.maxAgeMs ?? REPO_MAP_MAX_AGE_MS;

    const memoryEntry = this.memoryEntries.get(workspacePath);
    if (memoryEntry) {
      return this.toResponse({
        entry: memoryEntry,
        source: "memory",
        maxAgeMs,
      });
    }

    const workspacePointer = this.workspaceLatestDb.get(workspacePath);
    if (!workspacePointer?.cacheKey) {
      return { ok: false, stderr: "No cached repo-map context available." };
    }

    const entry = this.entriesDb.get(workspacePointer.cacheKey);
    if (!entry) {
      return { ok: false, stderr: "Repo-map context pointer is stale." };
    }

    this.remember(entry);
    return this.toResponse({
      entry,
      source: "lmdb",
      maxAgeMs,
    });
  }

  async getOrCreateContext(args: { rootPath: string; refresh?: boolean; maxAgeMs?: number }): Promise<RepoMapContextResponse> {
    const workspacePath = normalizePath(args.rootPath);
    const maxAgeMs = args.maxAgeMs ?? REPO_MAP_MAX_AGE_MS;
    const inFlightKey = `${workspacePath}:${args.refresh ? "force" : "normal"}`;
    const existing = this.inFlight.get(inFlightKey);
    if (existing) {
      return existing;
    }

    const promise = this.loadOrCreateContext({
      rootPath: workspacePath,
      refresh: args.refresh,
      maxAgeMs,
    }).finally(() => {
      this.inFlight.delete(inFlightKey);
    });
    this.inFlight.set(inFlightKey, promise);
    return promise;
  }

  private async loadOrCreateContext(args: { rootPath: string; refresh?: boolean; maxAgeMs: number }) {
    const workspacePath = normalizePath(args.rootPath);
    const identity = await this.resolveIdentity(workspacePath);
    const exactEntry = this.entriesDb.get(identity.cacheKey);
    if (!args.refresh && exactEntry && !this.isStale(exactEntry, args.maxAgeMs)) {
      await this.persistWorkspacePointer(workspacePath, exactEntry);
      this.remember(exactEntry);
      return this.toResponse({
        entry: exactEntry,
        source: "lmdb",
        maxAgeMs: args.maxAgeMs,
      });
    }

    const shouldForceRepoMapRefresh = args.refresh === true || !exactEntry;
    const { repoMap, source } = await this.loadRepoMap({
      rootPath: workspacePath,
      refresh: shouldForceRepoMapRefresh,
      maxAgeMs: args.maxAgeMs,
    });

    const entry: RepoMapContextCacheEntry = {
      version: CONTEXT_CACHE_VERSION,
      cacheKey: identity.cacheKey,
      stableKey: identity.stableKey,
      workspacePath,
      repoRoot: identity.repoRoot,
      worktreePath: identity.worktreePath,
      headSha: identity.headSha,
      dirtyFingerprint: identity.dirtyFingerprint,
      configHash: identity.configHash,
      updatedAt: repoMap.updatedAt,
      lastAccessedAt: new Date(this.now()).toISOString(),
      repoMapSource: source,
      repoMap,
      contextText: formatRepoMapForContext(repoMap),
    };

    await Promise.all([
      this.entriesDb.put(entry.cacheKey, entry),
      this.workspaceLatestDb.put(workspacePath, {
        cacheKey: entry.cacheKey,
        updatedAt: entry.updatedAt,
        accessedAt: entry.lastAccessedAt,
      }),
    ]);
    this.remember(entry);

    return this.toResponse({
      entry,
      source: source === "cache" ? "repo-map-cache" : "generated",
      maxAgeMs: args.maxAgeMs,
    });
  }

  private async persistWorkspacePointer(workspacePath: string, entry: RepoMapContextCacheEntry) {
    await this.workspaceLatestDb.put(workspacePath, {
      cacheKey: entry.cacheKey,
      updatedAt: entry.updatedAt,
      accessedAt: new Date(this.now()).toISOString(),
    });
  }

  private remember(entry: RepoMapContextCacheEntry) {
    this.memoryEntries.delete(entry.workspacePath);
    this.memoryEntries.set(entry.workspacePath, entry);
    while (this.memoryEntries.size > this.maxEntries) {
      const oldestKey = this.memoryEntries.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.memoryEntries.delete(oldestKey);
    }
  }

  private isStale(entry: RepoMapContextCacheEntry, maxAgeMs: number) {
    const updatedAtMs = Date.parse(entry.updatedAt);
    if (!Number.isFinite(updatedAtMs)) {
      return true;
    }
    return this.now() - updatedAtMs > maxAgeMs;
  }

  private toResponse(args: {
    entry: RepoMapContextCacheEntry;
    source: "memory" | "lmdb" | "repo-map-cache" | "generated";
    maxAgeMs: number;
  }): RepoMapContextResponse {
    return {
      ok: true,
      contextText: args.entry.contextText,
      source: args.source,
      updatedAt: args.entry.updatedAt,
      stale: this.isStale(args.entry, args.maxAgeMs),
    };
  }
}

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { RepoMapSnapshot } from "@/lib/fs/repo-map.types";
import { REPO_MAP_MAX_AGE_MS } from "@/lib/fs/repo-map.types";
import { RepoMapContextCache, type RepoMapContextIdentity } from "../electron/main/utils/repo-map-context-cache";

function createSnapshot(updatedAt: string): RepoMapSnapshot {
  return {
    version: 1,
    updatedAt,
    rootPath: "/tmp/project",
    fileCount: 10,
    codeFileCount: 7,
    docs: [{ path: "README.md", role: "overview" }],
    hotspots: [{
      filePath: "src/store/app.store.ts",
      score: 120,
      importCount: 12,
      importedByCount: 18,
      exportCount: 4,
      reasons: ["central state"],
    }],
    entrypoints: [{
      id: "app",
      title: "App Shell",
      summary: "Application entrypoint",
      filePaths: ["src/main.tsx"],
    }],
  };
}

function createIdentity(args: {
  workspacePath: string;
  cacheKey: string;
  stableKey?: string;
}): RepoMapContextIdentity {
  return {
    cacheKey: args.cacheKey,
    stableKey: args.stableKey ?? `stable:${args.cacheKey}`,
    workspacePath: args.workspacePath,
    repoRoot: args.workspacePath,
    worktreePath: args.workspacePath,
    headSha: "abc123",
    dirtyFingerprint: `dirty:${args.cacheKey}`,
    configHash: "config:1",
  };
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("RepoMapContextCache", () => {
  test("persists repo-map context in LMDB and reuses it across instances", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "stave-repo-map-context-"));
    tempDirs.push(cacheDir);

    let loadCount = 0;
    const now = Date.parse("2026-03-29T00:01:00.000Z");
    const identity = createIdentity({
      workspacePath: "/tmp/project-a",
      cacheKey: "cache:a",
    });

    const cacheA = new RepoMapContextCache({
      cacheDir,
      now: () => now,
      resolveIdentity: async () => identity,
      getOrCreateRepoMap: async () => {
        loadCount += 1;
        return {
          repoMap: createSnapshot("2026-03-29T00:00:00.000Z"),
          source: "generated",
          cachePath: "/tmp/project-a/.stave/cache/repo-map.json",
        };
      },
    });

    const first = await cacheA.getOrCreateContext({ rootPath: identity.workspacePath });
    expect(first.ok).toBe(true);
    expect(first.source).toBe("generated");
    expect(loadCount).toBe(1);
    await cacheA.close();

    const cacheB = new RepoMapContextCache({
      cacheDir,
      now: () => now,
      resolveIdentity: async () => identity,
      getOrCreateRepoMap: async () => {
        loadCount += 1;
        return {
          repoMap: createSnapshot("2026-03-29T00:00:00.000Z"),
          source: "generated",
          cachePath: "/tmp/project-a/.stave/cache/repo-map.json",
        };
      },
    });

    const cached = cacheB.getCachedContextSync({ rootPath: identity.workspacePath });
    expect(cached.ok).toBe(true);
    expect(cached.source).toBe("lmdb");

    const second = await cacheB.getOrCreateContext({ rootPath: identity.workspacePath });
    expect(second.ok).toBe(true);
    expect(second.source).toBe("lmdb");
    expect(loadCount).toBe(1);
    await cacheB.close();
  });

  test("forces repo-map regeneration when the exact cache key changes", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "stave-repo-map-context-"));
    tempDirs.push(cacheDir);

    const identities = [
      createIdentity({ workspacePath: "/tmp/project-b", cacheKey: "cache:b:1" }),
      createIdentity({ workspacePath: "/tmp/project-b", cacheKey: "cache:b:2" }),
    ];
    let identityIndex = 0;
    const refreshCalls: boolean[] = [];

    const cache = new RepoMapContextCache({
      cacheDir,
      resolveIdentity: async () => identities[Math.min(identityIndex++, identities.length - 1)]!,
      getOrCreateRepoMap: async (args) => {
        refreshCalls.push(Boolean(args.refresh));
        return {
          repoMap: createSnapshot("2026-03-29T00:00:00.000Z"),
          source: "generated",
          cachePath: "/tmp/project-b/.stave/cache/repo-map.json",
        };
      },
    });

    await cache.getOrCreateContext({ rootPath: "/tmp/project-b" });
    await cache.getOrCreateContext({ rootPath: "/tmp/project-b" });

    expect(refreshCalls).toEqual([true, true]);
    await cache.close();
  });

  test("reports stale cached entries once they pass the max age", async () => {
    const cacheDir = mkdtempSync(path.join(tmpdir(), "stave-repo-map-context-"));
    tempDirs.push(cacheDir);

    let now = 0;
    const cache = new RepoMapContextCache({
      cacheDir,
      now: () => now,
      resolveIdentity: async () => createIdentity({
        workspacePath: "/tmp/project-c",
        cacheKey: "cache:c",
      }),
      getOrCreateRepoMap: async () => ({
        repoMap: createSnapshot(new Date(now).toISOString()),
        source: "generated",
        cachePath: "/tmp/project-c/.stave/cache/repo-map.json",
      }),
    });

    await cache.getOrCreateContext({ rootPath: "/tmp/project-c" });
    now = REPO_MAP_MAX_AGE_MS + 1;

    const cached = cache.getCachedContextSync({ rootPath: "/tmp/project-c" });
    expect(cached.ok).toBe(true);
    expect(cached.stale).toBe(true);
    await cache.close();
  });
});

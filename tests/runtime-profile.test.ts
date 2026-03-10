import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  configurePersistenceUserDataPath,
  ensureLegacySharedDatabaseBecomesDevelopmentDatabase,
  resolveDevelopmentUserDataPath,
  resolvePersistenceRuntimeProfile,
} from "../electron/main/runtime-profile";

function createTempRoot() {
  return path.join(tmpdir(), `stave-runtime-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe("runtime profile persistence paths", () => {
  const cleanupRoots = new Set<string>();

  afterEach(() => {
    for (const root of cleanupRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    cleanupRoots.clear();
  });

  test("defaults to development when Electron is not packaged", () => {
    expect(resolvePersistenceRuntimeProfile({ isPackaged: false })).toBe("development");
    expect(resolvePersistenceRuntimeProfile({ isPackaged: true })).toBe("production");
    expect(resolvePersistenceRuntimeProfile({ isPackaged: false, override: "production" })).toBe("production");
  });

  test("moves the legacy shared sqlite files into the development profile once", () => {
    const root = createTempRoot();
    cleanupRoots.add(root);

    const productionUserDataPath = path.join(root, "Stave");
    const developmentUserDataPath = resolveDevelopmentUserDataPath({ productionUserDataPath });
    mkdirSync(productionUserDataPath, { recursive: true });

    writeFileSync(path.join(productionUserDataPath, "stave.sqlite"), "db");
    writeFileSync(path.join(productionUserDataPath, "stave.sqlite-wal"), "wal");
    writeFileSync(path.join(productionUserDataPath, "stave.sqlite-shm"), "shm");

    const firstRun = ensureLegacySharedDatabaseBecomesDevelopmentDatabase({
      productionUserDataPath,
      developmentUserDataPath,
    });

    expect(firstRun.migrated).toBe(true);
    expect(existsSync(path.join(productionUserDataPath, "stave.sqlite"))).toBe(false);
    expect(existsSync(path.join(developmentUserDataPath, "stave.sqlite"))).toBe(true);
    expect(existsSync(path.join(developmentUserDataPath, "stave.sqlite-wal"))).toBe(true);
    expect(existsSync(path.join(developmentUserDataPath, "stave.sqlite-shm"))).toBe(true);
    expect(JSON.parse(readFileSync(firstRun.markerPath, "utf8"))).toMatchObject({
      version: 1,
      migratedLegacyDatabaseToDevelopment: true,
    });

    writeFileSync(path.join(productionUserDataPath, "stave.sqlite"), "fresh-production-db");
    const secondRun = ensureLegacySharedDatabaseBecomesDevelopmentDatabase({
      productionUserDataPath,
      developmentUserDataPath,
    });

    expect(secondRun.migrated).toBe(false);
    expect(readFileSync(path.join(productionUserDataPath, "stave.sqlite"), "utf8")).toBe("fresh-production-db");
  });

  test("configures dev builds to use the dev userData path and built local runs to use production", () => {
    const root = createTempRoot();
    cleanupRoots.add(root);

    const productionUserDataPath = path.join(root, "Stave");
    let selectedUserDataPath = productionUserDataPath;

    const app = {
      isPackaged: false,
      getPath(name: "userData") {
        if (name !== "userData") {
          throw new Error(`Unexpected path request: ${name}`);
        }
        return productionUserDataPath;
      },
      setPath(name: "userData", value: string) {
        if (name !== "userData") {
          throw new Error(`Unexpected setPath request: ${name}`);
        }
        selectedUserDataPath = value;
      },
    };

    const devResult = configurePersistenceUserDataPath(app, {});
    expect(devResult.profile).toBe("development");
    expect(devResult.userDataPath).toBe(resolveDevelopmentUserDataPath({ productionUserDataPath }));
    expect(selectedUserDataPath).toBe(devResult.userDataPath);

    selectedUserDataPath = productionUserDataPath;
    const builtLocalResult = configurePersistenceUserDataPath(app, {
      STAVE_RUNTIME_PROFILE: "production",
    });
    expect(builtLocalResult.profile).toBe("production");
    expect(builtLocalResult.userDataPath).toBe(productionUserDataPath);
    expect(selectedUserDataPath).toBe(productionUserDataPath);
  });
});

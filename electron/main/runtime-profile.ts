import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type PersistenceRuntimeProfile = "development" | "production";

export interface AppPathConfigurator {
  isPackaged: boolean;
  getPath(name: "userData"): string;
  setPath(name: "userData", value: string): void;
}

const SQLITE_FILE_NAMES = [
  "stave.sqlite",
  "stave.sqlite-shm",
  "stave.sqlite-wal",
] as const;

const MIGRATION_MARKER_NAME = "persistence-profile-migration-v1.json";

export function resolvePersistenceRuntimeProfile(args: {
  isPackaged: boolean;
  override?: string | null;
}): PersistenceRuntimeProfile {
  const override = args.override?.trim().toLowerCase();
  if (override === "production" || override === "prod") {
    return "production";
  }
  if (override === "development" || override === "dev") {
    return "development";
  }
  return args.isPackaged ? "production" : "development";
}

export function resolveDevelopmentUserDataPath(args: { productionUserDataPath: string }) {
  const baseName = path.basename(args.productionUserDataPath);
  return path.join(path.dirname(args.productionUserDataPath), `${baseName}-dev`);
}

export function ensureLegacySharedDatabaseBecomesDevelopmentDatabase(args: {
  productionUserDataPath: string;
  developmentUserDataPath: string;
}) {
  const migrationMarkerPath = path.join(args.productionUserDataPath, MIGRATION_MARKER_NAME);
  if (existsSync(migrationMarkerPath)) {
    return { migrated: false, markerPath: migrationMarkerPath };
  }

  const productionDbPath = path.join(args.productionUserDataPath, SQLITE_FILE_NAMES[0]);
  const developmentDbPath = path.join(args.developmentUserDataPath, SQLITE_FILE_NAMES[0]);
  const canMigrateLegacyDatabase = existsSync(productionDbPath) && !existsSync(developmentDbPath);

  mkdirSync(args.productionUserDataPath, { recursive: true });

  if (canMigrateLegacyDatabase) {
    mkdirSync(args.developmentUserDataPath, { recursive: true });
    for (const fileName of SQLITE_FILE_NAMES) {
      const sourcePath = path.join(args.productionUserDataPath, fileName);
      const destinationPath = path.join(args.developmentUserDataPath, fileName);
      if (!existsSync(sourcePath) || existsSync(destinationPath)) {
        continue;
      }
      renameSync(sourcePath, destinationPath);
    }
  }

  writeFileSync(
    migrationMarkerPath,
    JSON.stringify(
      {
        version: 1,
        migratedLegacyDatabaseToDevelopment: canMigrateLegacyDatabase,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    migrated: canMigrateLegacyDatabase,
    markerPath: migrationMarkerPath,
  };
}

export function configurePersistenceUserDataPath(
  app: AppPathConfigurator,
  env: NodeJS.ProcessEnv = process.env,
) {
  const productionUserDataPath = app.getPath("userData");
  const developmentUserDataPath = resolveDevelopmentUserDataPath({ productionUserDataPath });

  ensureLegacySharedDatabaseBecomesDevelopmentDatabase({
    productionUserDataPath,
    developmentUserDataPath,
  });

  const profile = resolvePersistenceRuntimeProfile({
    isPackaged: app.isPackaged,
    override: env.STAVE_RUNTIME_PROFILE ?? null,
  });

  const selectedUserDataPath = profile === "production"
    ? productionUserDataPath
    : developmentUserDataPath;

  if (selectedUserDataPath !== productionUserDataPath) {
    app.setPath("userData", selectedUserDataPath);
  }

  return {
    profile,
    userDataPath: selectedUserDataPath,
    productionUserDataPath,
    developmentUserDataPath,
  };
}

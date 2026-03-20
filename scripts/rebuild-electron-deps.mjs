import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { applyBetterSqlite3ElectronPatch } from "./patch-better-sqlite3-electron.mjs";

const defaultRepoRoot = path.resolve(import.meta.dirname, "..");
const nativeModules = ["better-sqlite3", "node-pty"];

export function resolveElectronVersion(args = {}) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const rawElectronVersion = packageJson.devDependencies?.electron;

  if (typeof rawElectronVersion !== "string") {
    throw new Error("Unable to resolve the Electron version from package.json");
  }

  return rawElectronVersion.replace(/^[^\d]*/, "");
}

export function resolveNodeGypBin(args = {}) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;
  return path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "node-gyp.cmd" : "node-gyp");
}

export function rebuildNativeModule(args) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;
  const modulePath = path.join(repoRoot, "node_modules", args.moduleName);
  const nodeGypBin = resolveNodeGypBin({ repoRoot });

  const commandArgs = [
    "rebuild",
    "--runtime=electron",
    `--target=${args.electronVersion}`,
    `--arch=${args.arch}`,
    "--dist-url=https://www.electronjs.org/headers",
    "--build-from-source",
  ];

  const result = spawnSync(nodeGypBin, commandArgs, {
    cwd: modulePath,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`node-gyp failed to rebuild '${modulePath}'`);
  }
}

export function rebuildElectronDeps(args = {}) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;
  const arch = args.arch ?? process.env.npm_config_arch ?? process.env.ARCH ?? process.arch;
  const electronVersion = args.electronVersion ?? resolveElectronVersion({ repoRoot });

  applyBetterSqlite3ElectronPatch({ repoRoot });

  for (const moduleName of nativeModules) {
    rebuildNativeModule({
      repoRoot,
      moduleName,
      electronVersion,
      arch,
    });
  }
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  try {
    rebuildElectronDeps();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

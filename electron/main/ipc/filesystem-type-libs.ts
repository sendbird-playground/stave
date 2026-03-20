import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveRootFilePath } from "../utils/filesystem";

export interface MonacoVirtualFile {
  content: string;
  filePath: string;
}

interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const DEFAULT_MAX_PACKAGE_COUNT = 200;
const DEFAULT_MAX_FILE_COUNT = 1200;
const DEFAULT_MAX_DIRECTORY_DEPTH = 6;
const TYPE_DECLARATION_FILE_PATTERN = /\.d\.(ts|mts|cts)$/;

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

function toVirtualNodeModulesPath(args: { packageName: string; relativeFilePath: string }) {
  const normalizedRelativePath = toPosixPath(args.relativeFilePath).replace(/^\.?\//, "");
  return `file:///node_modules/${args.packageName}/${normalizedRelativePath}`;
}

function toPackageDirectory(rootPath: string, packageName: string) {
  return path.join(rootPath, "node_modules", ...packageName.split("/"));
}

function toDefinitelyTypedPackageName(packageName: string) {
  if (!packageName || packageName.startsWith("@types/")) {
    return null;
  }
  if (!packageName.startsWith("@")) {
    return `@types/${packageName}`;
  }
  const [, scope, name] = packageName.match(/^@([^/]+)\/(.+)$/) ?? [];
  if (!scope || !name) {
    return null;
  }
  return `@types/${scope}__${name}`;
}

function collectRootDependencyNames(pkg: PackageJsonLike | null) {
  return Array.from(new Set([
    ...Object.keys(pkg?.dependencies ?? {}),
    ...Object.keys(pkg?.devDependencies ?? {}),
  ]));
}

function collectNestedDependencyNames(pkg: PackageJsonLike | null) {
  return Array.from(new Set([
    ...Object.keys(pkg?.dependencies ?? {}),
    ...Object.keys(pkg?.peerDependencies ?? {}),
  ]));
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function readWorkspaceTypeDefinitionFiles(args: {
  rootPath?: string | null;
  maxPackageCount?: number;
  maxFileCount?: number;
  maxDirectoryDepth?: number;
}) {
  const rootPath = resolveRootFilePath({ rootPath: args.rootPath, filePath: "." });
  if (!rootPath) {
    throw new Error("Workspace root path is required.");
  }
  const libs: MonacoVirtualFile[] = [];
  const maxPackageCount = args.maxPackageCount ?? DEFAULT_MAX_PACKAGE_COUNT;
  const maxFileCount = args.maxFileCount ?? DEFAULT_MAX_FILE_COUNT;
  const maxDirectoryDepth = args.maxDirectoryDepth ?? DEFAULT_MAX_DIRECTORY_DEPTH;
  const queuedPackages = new Set<string>();
  const visitedPackages = new Set<string>();
  const seenVirtualPaths = new Set<string>();
  const queue: string[] = [];

  async function addVirtualFile(absolutePath: string, virtualPath: string) {
    if (libs.length >= maxFileCount || seenVirtualPaths.has(virtualPath)) {
      return;
    }
    try {
      const content = await fs.readFile(absolutePath, "utf8");
      libs.push({ content, filePath: virtualPath });
      seenVirtualPaths.add(virtualPath);
    } catch {
      // Skip unreadable files.
    }
  }

  function enqueuePackage(packageName: string | null) {
    if (!packageName || queuedPackages.has(packageName) || visitedPackages.has(packageName)) {
      return;
    }
    if (visitedPackages.size + queue.length >= maxPackageCount) {
      return;
    }
    queuedPackages.add(packageName);
    queue.push(packageName);
  }

  async function collectPackageFiles(packageName: string) {
    const packageDir = toPackageDirectory(rootPath, packageName);
    if (!await pathExists(packageDir)) {
      return null;
    }

    const packageJsonPath = path.join(packageDir, "package.json");
    const packageJson = await readJsonFile<PackageJsonLike>(packageJsonPath);
    if (packageJson) {
      await addVirtualFile(
        packageJsonPath,
        toVirtualNodeModulesPath({ packageName, relativeFilePath: "package.json" }),
      );
    }

    async function walk(currentDir: string, depth: number): Promise<void> {
      if (depth > maxDirectoryDepth || libs.length >= maxFileCount) {
        return;
      }
      let entries;
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (libs.length >= maxFileCount) {
          break;
        }
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") {
            continue;
          }
          await walk(absolutePath, depth + 1);
          continue;
        }
        if (!entry.isFile() || !TYPE_DECLARATION_FILE_PATTERN.test(entry.name)) {
          continue;
        }
        const relativePath = path.relative(packageDir, absolutePath);
        await addVirtualFile(
          absolutePath,
          toVirtualNodeModulesPath({ packageName, relativeFilePath: relativePath }),
        );
      }
    }

    await walk(packageDir, 0);
    return packageJson;
  }

  const rootPackageJson = await readJsonFile<PackageJsonLike>(path.join(rootPath, "package.json"));
  if (!rootPackageJson) {
    throw new Error("Unable to read package.json from workspace root.");
  }

  enqueuePackage("@types/node");
  for (const dependencyName of collectRootDependencyNames(rootPackageJson)) {
    enqueuePackage(dependencyName);
    enqueuePackage(toDefinitelyTypedPackageName(dependencyName));
  }

  while (queue.length > 0 && libs.length < maxFileCount && visitedPackages.size < maxPackageCount) {
    const packageName = queue.shift();
    if (!packageName) {
      continue;
    }
    queuedPackages.delete(packageName);
    if (visitedPackages.has(packageName)) {
      continue;
    }
    visitedPackages.add(packageName);
    const packageJson = await collectPackageFiles(packageName);
    for (const dependencyName of collectNestedDependencyNames(packageJson)) {
      enqueuePackage(dependencyName);
      enqueuePackage(toDefinitelyTypedPackageName(dependencyName));
    }
  }

  return libs;
}

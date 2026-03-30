import { promises as fs } from "node:fs";
import path from "node:path";
import type { RootFileEntry } from "../types";

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  ".next",
  ".nuxt",
  // macOS system directories
  ".Trash",
  ".Trashes",
  "Library",
  // Linux system directories
  ".local",
  ".cache",
]);

function normalizePathInput(value: string | null | undefined) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function revisionFromStat(args: { size: number; mtimeMs: number }) {
  return `node:${args.size}:${Math.floor(args.mtimeMs)}`;
}

export function isIgnoredDirectory(args: { name: string }) {
  return IGNORED_DIRECTORY_NAMES.has(args.name);
}

function toSafeRelativePath(value: string | null | undefined) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

export function resolveRootDirectoryPath(args: { rootPath?: string | null; directoryPath?: string | null }) {
  const rootPath = normalizePathInput(args.rootPath);
  if (!rootPath) {
    return null;
  }
  const normalizedRoot = path.resolve(rootPath);
  const directoryPath = toSafeRelativePath(args.directoryPath);
  if (!directoryPath) {
    return normalizedRoot;
  }
  const absolute = path.resolve(normalizedRoot, directoryPath);
  const relative = path.relative(normalizedRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return absolute;
}

export async function listFilesRecursive(args: { rootPath?: string | null; maxDepth?: number; maxFiles?: number }): Promise<string[]> {
  const rootPath = normalizePathInput(args.rootPath);
  if (!rootPath) {
    throw new Error("Workspace root path is required.");
  }
  const maxDepth = args.maxDepth ?? 32;
  const maxFiles = args.maxFiles ?? 25_000;
  const files: RootFileEntry[] = [];

  async function walk(currentPath: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth || files.length >= maxFiles) {
      return;
    }
    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      // Skip directories that cannot be read (EPERM, EACCES, etc.)
      return;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        break;
      }
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (isIgnoredDirectory({ name: entry.name })) {
          continue;
        }
        await walk(fullPath, relativePath, depth + 1);
      } else if (entry.isFile()) {
        files.push({ relativePath });
      }
    }
  }

  await walk(rootPath, "", 0);
  return files.map((item) => item.relativePath).sort();
}

export function resolveRootFilePath(args: { rootPath?: string | null; filePath?: string | null }) {
  const filePath = normalizePathInput(args.filePath);
  if (!filePath) {
    return null;
  }
  return resolveRootDirectoryPath({
    rootPath: args.rootPath,
    directoryPath: filePath,
  });
}

export async function listDirectoryEntries(args: { rootPath?: string | null; directoryPath?: string | null }) {
  const absolutePath = resolveRootDirectoryPath(args);
  if (!absolutePath) {
    throw new Error("Invalid directory path.");
  }

  const relativeDirectoryPath = toSafeRelativePath(args.directoryPath);
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES") {
      return [];
    }
    throw error;
  }
  return entries
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        if (isIgnoredDirectory({ name: entry.name })) {
          return [];
        }
        const relativePath = relativeDirectoryPath ? `${relativeDirectoryPath}/${entry.name}` : entry.name;
        return [{ name: entry.name, path: relativePath, type: "folder" as const }];
      }
      if (entry.isFile()) {
        const relativePath = relativeDirectoryPath ? `${relativeDirectoryPath}/${entry.name}` : entry.name;
        return [{ name: entry.name, path: relativePath, type: "file" as const }];
      }
      return [];
    })
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

export function mimeTypeFromFilePath(args: { filePath: string }) {
  const lower = args.filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".avif")) return "image/avif";
  return "application/octet-stream";
}

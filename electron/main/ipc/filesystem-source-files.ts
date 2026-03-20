import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveRootFilePath } from "../utils/filesystem";

export async function readWorkspaceSourceFiles(args: { rootPath?: string | null }) {
  const rootPath = resolveRootFilePath({ rootPath: args.rootPath, filePath: "." });
  if (!rootPath) {
    throw new Error("Workspace root path is required.");
  }
  const files: Array<{ content: string; filePath: string }> = [];
  const MAX_TOTAL = 800;
  const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "out", "build", ".next", ".nuxt"]);

  function toWorkspaceModelUri(filePath: string) {
    const normalized = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
    return `file:///${normalized}`;
  }

  async function collectSrc(dir: string, relativeDir: string): Promise<void> {
    if (files.length >= MAX_TOTAL) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= MAX_TOTAL) {
        break;
      }
      if (entry.isFile() && /\.(tsx?|d\.ts)$/.test(entry.name)) {
        try {
          const content = await fs.readFile(path.join(dir, entry.name), "utf-8");
          const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
          files.push({ content, filePath: toWorkspaceModelUri(relativePath) });
        } catch {
          // Skip unreadable files.
        }
      } else if (entry.isDirectory() && !EXCLUDED_DIRS.has(entry.name)) {
        const childRelativeDir = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
        await collectSrc(path.join(dir, entry.name), childRelativeDir);
      }
    }
  }

  await collectSrc(rootPath, "");
  return files;
}

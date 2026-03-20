import { dialog, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  FilesystemFileArgsSchema,
  FilesystemRootArgsSchema,
  FilesystemWriteFileArgsSchema,
  OpenExternalArgsSchema,
} from "./schemas";
import { openExternalWithFallback } from "../utils/external-url";
import { listFilesRecursive, mimeTypeFromFilePath, resolveRootFilePath, revisionFromStat } from "../utils/filesystem";
import { readWorkspaceSourceFiles } from "./filesystem-source-files";
import { readWorkspaceTypeDefinitionFiles } from "./filesystem-type-libs";

export function registerFilesystemHandlers() {
  ipcMain.handle("fs:pick-root", async () => {
    const selected = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (selected.canceled || selected.filePaths.length === 0) {
      return { ok: false, files: [], stderr: "No folder selected." };
    }
    const rootPath = selected.filePaths[0];
    if (!rootPath) {
      return { ok: false, files: [], stderr: "No folder selected." };
    }
    try {
      const files = await listFilesRecursive({ rootPath });
      return { ok: true, rootPath, rootName: path.basename(rootPath), files };
    } catch (error) {
      return { ok: false, files: [], stderr: String(error) };
    }
  });

  ipcMain.handle("shell:open-external", async (_event, args: unknown) => {
    const parsed = OpenExternalArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid external URL request." };
    }
    return openExternalWithFallback({ url: parsed.data.url });
  });

  ipcMain.handle("fs:list-files", async (_event, args: unknown) => {
    const parsed = FilesystemRootArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, files: [], stderr: "Invalid file listing request." };
    }
    try {
      const files = await listFilesRecursive({ rootPath: parsed.data.rootPath });
      return { ok: true, files };
    } catch (error) {
      return { ok: false, files: [], stderr: String(error) };
    }
  });

  ipcMain.handle("fs:read-file", async (_event, args: unknown) => {
    const parsed = FilesystemFileArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, content: "", revision: "", stderr: "Invalid file read request." };
    }
    const absolutePath = resolveRootFilePath(parsed.data);
    if (!absolutePath) {
      return { ok: false, content: "", revision: "", stderr: "Invalid file path." };
    }
    try {
      const [content, stat] = await Promise.all([fs.readFile(absolutePath, "utf8"), fs.stat(absolutePath)]);
      return {
        ok: true,
        content,
        revision: revisionFromStat({ size: stat.size, mtimeMs: stat.mtimeMs }),
      };
    } catch (error) {
      return { ok: false, content: "", revision: "", stderr: String(error) };
    }
  });

  ipcMain.handle("fs:read-file-data-url", async (_event, args: unknown) => {
    const parsed = FilesystemFileArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, dataUrl: "", revision: "", stderr: "Invalid file read request." };
    }
    const absolutePath = resolveRootFilePath(parsed.data);
    if (!absolutePath) {
      return { ok: false, dataUrl: "", revision: "", stderr: "Invalid file path." };
    }
    try {
      const [buffer, stat] = await Promise.all([fs.readFile(absolutePath), fs.stat(absolutePath)]);
      const mimeType = mimeTypeFromFilePath({ filePath: parsed.data.filePath });
      return {
        ok: true,
        dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
        revision: revisionFromStat({ size: stat.size, mtimeMs: stat.mtimeMs }),
      };
    } catch (error) {
      return { ok: false, dataUrl: "", revision: "", stderr: String(error) };
    }
  });

  ipcMain.handle("fs:write-file", async (_event, args: unknown) => {
    const parsed = FilesystemWriteFileArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, stderr: "Invalid file write request." };
    }
    const absolutePath = resolveRootFilePath(parsed.data);
    if (!absolutePath) {
      return { ok: false, stderr: "Invalid file path." };
    }
    try {
      const beforeStat = await fs.stat(absolutePath);
      const currentRevision = revisionFromStat({ size: beforeStat.size, mtimeMs: beforeStat.mtimeMs });
      if (parsed.data.expectedRevision && parsed.data.expectedRevision !== currentRevision) {
        return { ok: false, conflict: true, revision: currentRevision };
      }
      await fs.writeFile(absolutePath, parsed.data.content, "utf8");
      const nextStat = await fs.stat(absolutePath);
      return {
        ok: true,
        revision: revisionFromStat({ size: nextStat.size, mtimeMs: nextStat.mtimeMs }),
      };
    } catch (error) {
      return { ok: false, stderr: String(error) };
    }
  });

  ipcMain.handle("fs:read-type-defs", async (_event, args: unknown) => {
    const parsed = FilesystemRootArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, libs: [], stderr: "Invalid type definition request." };
    }
    try {
      const libs = await readWorkspaceTypeDefinitionFiles({ rootPath: parsed.data.rootPath });
      return { ok: true, libs };
    } catch (error) {
      return { ok: false, libs: [], stderr: String(error) };
    }
  });

  ipcMain.handle("fs:read-source-files", async (_event, args: unknown) => {
    const parsed = FilesystemRootArgsSchema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, files: [], stderr: "Invalid source file request." };
    }
    try {
      const files = await readWorkspaceSourceFiles({ rootPath: parsed.data.rootPath });
      return { ok: true, files };
    } catch (error) {
      return { ok: false, files: [], stderr: String(error) };
    }
  });
}

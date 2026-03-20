import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { readWorkspaceSourceFiles } from "../electron/main/ipc/filesystem-source-files";

const tempDirs: string[] = [];

function createTempWorkspace() {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "stave-source-files-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

function writeText(filePath: string, value: string) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value);
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("readWorkspaceSourceFiles", () => {
  test("returns canonical Monaco file URIs for workspace source models", async () => {
    const workspaceRoot = createTempWorkspace();
    writeText(path.join(workspaceRoot, "src/App.tsx"), "export const App = () => null;\n");
    writeText(path.join(workspaceRoot, "src/store/app.store.ts"), "export const useAppStore = () => null;\n");

    const files = await readWorkspaceSourceFiles({ rootPath: workspaceRoot });
    const filePaths = files.map((file) => file.filePath).sort();

    expect(filePaths).toEqual([
      "file:///src/App.tsx",
      "file:///src/store/app.store.ts",
    ]);
  });

  test("throws a descriptive error when rootPath is missing", async () => {
    await expect(readWorkspaceSourceFiles({ rootPath: undefined })).rejects.toThrow("Workspace root path is required.");
  });
});

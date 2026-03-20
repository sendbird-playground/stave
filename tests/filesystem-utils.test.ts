import { describe, expect, test } from "bun:test";
import {
  FilesystemFileArgsSchema,
  FilesystemRootArgsSchema,
  FilesystemWriteFileArgsSchema,
} from "../electron/main/ipc/schemas";
import { listFilesRecursive, resolveRootFilePath } from "../electron/main/utils/filesystem";

describe("filesystem IPC validation", () => {
  test("rejects requests with missing path fields before they reach path utilities", () => {
    expect(FilesystemRootArgsSchema.safeParse({}).success).toBe(false);
    expect(FilesystemFileArgsSchema.safeParse({ rootPath: "/tmp/project" }).success).toBe(false);
    expect(
      FilesystemWriteFileArgsSchema.safeParse({
        rootPath: "/tmp/project",
        filePath: "src/index.ts",
      }).success,
    ).toBe(false);
  });
});

describe("filesystem path helpers", () => {
  test("returns null instead of throwing when a file request omits a path value", () => {
    expect(resolveRootFilePath({ rootPath: undefined, filePath: "src/index.ts" })).toBeNull();
    expect(resolveRootFilePath({ rootPath: "/tmp/project", filePath: undefined })).toBeNull();
  });

  test("throws a descriptive error when listing files without a workspace root", async () => {
    await expect(listFilesRecursive({ rootPath: undefined })).rejects.toThrow("Workspace root path is required.");
  });
});

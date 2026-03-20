import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { readWorkspaceTypeDefinitionFiles } from "../electron/main/ipc/filesystem-type-libs";

const tempDirs: string[] = [];

function createTempWorkspace() {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "stave-type-libs-"));
  tempDirs.push(workspaceRoot);
  return workspaceRoot;
}

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2));
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

describe("readWorkspaceTypeDefinitionFiles", () => {
  test("preserves package type entry paths under node_modules", async () => {
    const workspaceRoot = createTempWorkspace();
    writeJson(path.join(workspaceRoot, "package.json"), {
      dependencies: {
        "lucide-react": "0.0.0",
      },
    });
    writeJson(path.join(workspaceRoot, "node_modules/lucide-react/package.json"), {
      name: "lucide-react",
      typings: "dist/lucide-react.d.ts",
    });
    writeText(
      path.join(workspaceRoot, "node_modules/lucide-react/dist/lucide-react.d.ts"),
      "export declare const Circle: () => null;\n",
    );

    const libs = await readWorkspaceTypeDefinitionFiles({ rootPath: workspaceRoot });
    const filePaths = libs.map((file) => file.filePath);

    expect(filePaths).toContain("file:///node_modules/lucide-react/package.json");
    expect(filePaths).toContain("file:///node_modules/lucide-react/dist/lucide-react.d.ts");
  });

  test("walks transitive package dependencies for downstream type imports", async () => {
    const workspaceRoot = createTempWorkspace();
    writeJson(path.join(workspaceRoot, "package.json"), {
      dependencies: {
        alpha: "0.0.0",
      },
    });
    writeJson(path.join(workspaceRoot, "node_modules/alpha/package.json"), {
      name: "alpha",
      types: "index.d.ts",
      dependencies: {
        beta: "0.0.0",
      },
    });
    writeText(
      path.join(workspaceRoot, "node_modules/alpha/index.d.ts"),
      "export type { BetaValue } from \"beta\";\n",
    );
    writeJson(path.join(workspaceRoot, "node_modules/beta/package.json"), {
      name: "beta",
      types: "types/index.d.ts",
    });
    writeText(
      path.join(workspaceRoot, "node_modules/beta/types/index.d.ts"),
      "export interface BetaValue { value: string; }\n",
    );

    const libs = await readWorkspaceTypeDefinitionFiles({ rootPath: workspaceRoot });
    const filePaths = libs.map((file) => file.filePath);

    expect(filePaths).toContain("file:///node_modules/alpha/index.d.ts");
    expect(filePaths).toContain("file:///node_modules/beta/package.json");
    expect(filePaths).toContain("file:///node_modules/beta/types/index.d.ts");
  });

  test("loads definitely typed packages for dependencies without bundled types", async () => {
    const workspaceRoot = createTempWorkspace();
    writeJson(path.join(workspaceRoot, "package.json"), {
      dependencies: {
        "better-sqlite3": "0.0.0",
      },
    });
    writeJson(path.join(workspaceRoot, "node_modules/better-sqlite3/package.json"), {
      name: "better-sqlite3",
    });
    writeJson(path.join(workspaceRoot, "node_modules/@types/better-sqlite3/package.json"), {
      name: "@types/better-sqlite3",
      types: "index.d.ts",
    });
    writeText(
      path.join(workspaceRoot, "node_modules/@types/better-sqlite3/index.d.ts"),
      "declare module \"better-sqlite3\" { export default class Database {} }\n",
    );

    const libs = await readWorkspaceTypeDefinitionFiles({ rootPath: workspaceRoot });
    const filePaths = libs.map((file) => file.filePath);

    expect(filePaths).toContain("file:///node_modules/@types/better-sqlite3/package.json");
    expect(filePaths).toContain("file:///node_modules/@types/better-sqlite3/index.d.ts");
  });

  test("throws a descriptive error when rootPath is missing", async () => {
    await expect(readWorkspaceTypeDefinitionFiles({ rootPath: undefined })).rejects.toThrow("Workspace root path is required.");
  });
});

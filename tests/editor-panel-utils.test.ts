import { describe, expect, test } from "bun:test";
import { buildExplorerIndex, collectAncestorFolders, normalizeRelativeInputPath } from "@/components/layout/editor-panel.utils";

describe("normalizeRelativeInputPath", () => {
  test("normalizes safe relative paths", () => {
    expect(normalizeRelativeInputPath({ value: "./src\\components/app.tsx/" })).toBe("src/components/app.tsx");
  });

  test("rejects absolute and parent-relative paths", () => {
    expect(normalizeRelativeInputPath({ value: "/etc/passwd" })).toBeNull();
    expect(normalizeRelativeInputPath({ value: "../secret.txt" })).toBeNull();
  });
});

describe("collectAncestorFolders", () => {
  test("returns each ancestor folder in order", () => {
    expect(collectAncestorFolders({ path: "src/components/layout" })).toEqual([
      "src",
      "src/components",
      "src/components/layout",
    ]);
  });
});

describe("buildExplorerIndex", () => {
  test("builds a sorted explorer tree and supporting folder metadata in one pass", () => {
    const index = buildExplorerIndex({
      files: [
        "src/lib/utils.ts",
        "README.md",
        "src/components/App.tsx",
        "src/components/ui/button.tsx",
      ],
    });

    expect(index.topFolders).toEqual(["src", "README.md"]);
    expect(index.folderPaths).toEqual([
      "src",
      "src/components",
      "src/components/ui",
      "src/lib",
    ]);
    expect(index.tree.map((node) => `${node.type}:${node.name}`)).toEqual([
      "folder:src",
      "file:README.md",
    ]);
    expect(index.tree[0]?.children.map((node) => `${node.type}:${node.name}`)).toEqual([
      "folder:components",
      "folder:lib",
    ]);
  });

  test("filters files while preserving matching ancestor folders", () => {
    const index = buildExplorerIndex({
      files: [
        "src/components/App.tsx",
        "src/components/ui/button.tsx",
        "src/lib/utils.ts",
      ],
      filter: "button",
    });

    expect(index.tree).toHaveLength(1);
    expect(index.tree[0]?.path).toBe("src");
    expect(index.tree[0]?.children[0]?.path).toBe("src/components");
    expect(index.tree[0]?.children[0]?.children[0]?.path).toBe("src/components/ui");
    expect(index.tree[0]?.children[0]?.children[0]?.children[0]?.path).toBe("src/components/ui/button.tsx");
  });
});

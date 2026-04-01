export interface ExplorerNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children: ExplorerNode[];
}

export interface ExplorerIndex {
  tree: ExplorerNode[];
  folderPaths: string[];
  topFolders: string[];
}

export function normalizeRelativeInputPath(args: { value: string }) {
  const normalized = args.value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!normalized || normalized.startsWith("/")) {
    return null;
  }
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  if (parts.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return parts.join("/");
}

export function collectAncestorFolders(args: { path: string }) {
  const folders: string[] = [];
  let current = "";
  for (const segment of args.path.split("/").filter(Boolean)) {
    current = current ? `${current}/${segment}` : segment;
    folders.push(current);
  }
  return folders;
}

export function getExplorerExpandedPathsAfterCreate(args: {
  path: string;
  type: "file" | "folder";
}) {
  if (args.type === "folder") {
    return collectAncestorFolders({ path: args.path });
  }

  const parentPath = args.path.split("/").slice(0, -1).join("/");
  return collectAncestorFolders({ path: parentPath });
}

export function buildExplorerIndex(args: { files: string[]; filter?: string }): ExplorerIndex {
  const root: ExplorerNode = { name: "root", path: "", type: "folder", children: [] };
  const normalizedFilter = args.filter?.trim().toLowerCase() ?? "";
  const folders = new Map<string, ExplorerNode>([["", root]]);
  const topFolders = new Set<string>();

  for (const filePath of args.files) {
    const parts = filePath.split("/").filter(Boolean);
    if (parts[0]) {
      topFolders.add(parts[0]);
    }
    let parentPath = "";
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      if (!name) {
        continue;
      }
      const path = parentPath ? `${parentPath}/${name}` : name;
      const isFile = index === parts.length - 1;
      if (folders.has(path)) {
        parentPath = path;
        continue;
      }
      const parent = folders.get(parentPath);
      if (!parent) {
        break;
      }

      const node: ExplorerNode = {
        name,
        path,
        type: isFile ? "file" : "folder",
        children: [],
      };
      parent.children.push(node);
      if (!isFile) {
        folders.set(path, node);
      }
      parentPath = path;
    }
  }

  const sortTree = (node: ExplorerNode) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) {
      if (child.type === "folder") {
        sortTree(child);
      }
    }
  };
  sortTree(root);

  const filterNode = (node: ExplorerNode): ExplorerNode | null => {
    if (!normalizedFilter) {
      return node;
    }
    if (node.type === "file") {
      return node.path.toLowerCase().includes(normalizedFilter) ? node : null;
    }
    const children = node.children.map(filterNode).filter(Boolean) as ExplorerNode[];
    if (children.length > 0 || node.path.toLowerCase().includes(normalizedFilter)) {
      return { ...node, children };
    }
    return null;
  };

  const tree = root.children.map(filterNode).filter(Boolean) as ExplorerNode[];
  const folderPaths: string[] = [];

  const collectFolderPaths = (node: ExplorerNode) => {
    if (node.type !== "folder") {
      return;
    }
    folderPaths.push(node.path);
    for (const child of node.children) {
      collectFolderPaths(child);
    }
  };

  for (const node of tree) {
    collectFolderPaths(node);
  }

  return {
    tree,
    folderPaths,
    topFolders: Array.from(topFolders),
  };
}

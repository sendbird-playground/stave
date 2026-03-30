export interface ResolvedWorkspaceFileLink {
  filePath: string;
  fileName: string;
}

function stripLineSuffix(href: string) {
  return href
    .replace(/#L\d+(?:C\d+)?$/i, "")
    .replace(/:\d+(?::\d+)?$/, "");
}

export function toBaseName(filePath: string) {
  return filePath.split("/").filter(Boolean).at(-1) ?? filePath;
}

export function resolveWorkspaceFileLink(args: {
  href?: string;
  workspaceCwd?: string;
  knownFilePaths?: Set<string>;
}): ResolvedWorkspaceFileLink | null {
  const raw = args.href?.trim();
  if (!raw || raw.startsWith("#")) {
    return null;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith("file://")) {
    return null;
  }

  let decoded = raw.replace(/^file:\/\//, "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Ignore decoding failures and keep the original href.
  }

  const withoutQuery = decoded.split("?")[0] ?? decoded;
  const withoutFragment = withoutQuery.split("#")[0] ?? withoutQuery;
  const normalized = stripLineSuffix(withoutFragment)
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized) {
    return null;
  }

  let filePath = normalized;
  if (normalized.startsWith("/")) {
    if (!args.workspaceCwd) {
      return null;
    }

    const normalizedWorkspaceCwd = args.workspaceCwd.replaceAll("\\", "/").replace(/\/+$/, "");
    const prefix = `${normalizedWorkspaceCwd}/`;
    if (!normalized.startsWith(prefix)) {
      return null;
    }
    filePath = normalized.slice(prefix.length);
  }

  if (!filePath || filePath === ".." || filePath.startsWith("../")) {
    return null;
  }

  if (args.knownFilePaths && args.knownFilePaths.size > 0 && !args.knownFilePaths.has(filePath)) {
    return null;
  }

  return {
    filePath,
    fileName: toBaseName(filePath),
  };
}

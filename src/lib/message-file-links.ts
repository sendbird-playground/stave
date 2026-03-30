export interface ResolvedWorkspaceFileLink {
  filePath: string;
  fileName: string;
  line?: number;
  column?: number;
}

function stripLineSuffix(href: string) {
  return href
    .replace(/#L\d+(?:C\d+)?$/i, "")
    .replace(/:\d+(?::\d+)?$/, "");
}

function parseFileLinkLocation(href: string) {
  const hashMatch = href.match(/#L(\d+)(?:C(\d+))?$/i);
  if (hashMatch) {
    return {
      line: Number(hashMatch[1]),
      column: hashMatch[2] ? Number(hashMatch[2]) : undefined,
    };
  }

  const colonMatch = href.match(/:(\d+)(?::(\d+))?$/);
  if (colonMatch) {
    return {
      line: Number(colonMatch[1]),
      column: colonMatch[2] ? Number(colonMatch[2]) : undefined,
    };
  }

  return null;
}

export function formatFileLinkLocation(args: { line?: number; column?: number }) {
  if (!args.line) {
    return null;
  }

  return args.column ? `L${args.line}:C${args.column}` : `L${args.line}`;
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
  const location = parseFileLinkLocation(withoutQuery);
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
    ...(location ?? {}),
  };
}

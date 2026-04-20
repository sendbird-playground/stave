import { resolveLanguage } from "@/store/editor.utils";

export interface ColiseumAttachmentFileContext {
  filePath: string;
  content: string;
  language: string;
  instruction?: string;
}

export interface ColiseumAttachmentEditorTabSnapshot {
  filePath: string;
  content: string;
  language: string;
  kind?: "text" | "image";
}

export async function resolveColiseumAttachmentFileContexts(args: {
  attachedFilePaths: readonly string[];
  editorTabs: readonly ColiseumAttachmentEditorTabSnapshot[];
  workspaceRootPath?: string | null;
  readFile?: (args: {
    rootPath: string;
    filePath: string;
  }) => Promise<{ ok: boolean; content: string }>;
}) {
  const fileContexts: ColiseumAttachmentFileContext[] = [];
  const unreadableFilePaths: string[] = [];
  const seenFilePaths = new Set<string>();

  for (const rawFilePath of args.attachedFilePaths) {
    const filePath = rawFilePath.trim();
    if (!filePath || seenFilePaths.has(filePath)) {
      continue;
    }
    seenFilePaths.add(filePath);

    const openTab = args.editorTabs.find(
      (tab) => tab.filePath === filePath && tab.kind !== "image",
    );
    if (openTab) {
      fileContexts.push({
        filePath: openTab.filePath,
        content: openTab.content,
        language: openTab.language,
      });
      continue;
    }

    if (!args.workspaceRootPath || !args.readFile) {
      unreadableFilePaths.push(filePath);
      continue;
    }

    const result = await args.readFile({
      rootPath: args.workspaceRootPath,
      filePath,
    });
    if (!result.ok) {
      unreadableFilePaths.push(filePath);
      continue;
    }

    fileContexts.push({
      filePath,
      content: result.content,
      language: resolveLanguage({ filePath }),
    });
  }

  return { fileContexts, unreadableFilePaths };
}

export function mergeColiseumAttachedFilePaths(args: {
  existing: readonly string[];
  incoming: readonly string[];
}) {
  const deduped = new Set<string>();

  for (const candidate of [...args.existing, ...args.incoming]) {
    const normalized = candidate.trim();
    if (normalized) {
      deduped.add(normalized);
    }
  }

  return Array.from(deduped);
}

export function isColiseumSubmitShortcut(args: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}) {
  return (
    args.key === "Enter" &&
    (args.ctrlKey || args.metaKey) === true &&
    !args.altKey &&
    !args.isComposing
  );
}

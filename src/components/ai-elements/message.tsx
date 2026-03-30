import type { ButtonHTMLAttributes, HTMLAttributes, MouseEvent, ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveWorkspaceFileLink } from "@/lib/message-file-links";
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "./code-block";
import { MarkdownMessage, resolveMessageSizeClass } from "./message-markdown";

interface MessageProps extends HTMLAttributes<HTMLDivElement> {
  from: "user" | "assistant";
}

export function Message({ from, className, ...props }: MessageProps) {
  return (
    <article
      className={cn(
        "group flex flex-col gap-2",
        from === "user" ? "is-user" : "is-assistant",
        from === "user" ? "items-end" : "items-start",
        className
      )}
      {...props}
    />
  );
}

export function MessageContent(props: HTMLAttributes<HTMLDivElement>) {
  const messageFontSize = useAppStore((state) => state.settings.messageFontSize);
  return (
    <div
      className={cn(
        "w-full rounded-md border border-border/80 bg-card px-3 py-2 shadow-sm",
        resolveMessageSizeClass(messageFontSize),
        "leading-7",
        "group-[.is-user]:border-primary/40 group-[.is-user]:bg-primary/15"
      )}
      {...props}
    />
  );
}

interface MessageResponseProps extends HTMLAttributes<HTMLDivElement> {
  isStreaming?: boolean;
}

export function MessageResponse({ isStreaming, ...props }: MessageResponseProps) {
  const openFileFromTree = useAppStore((state) => state.openFileFromTree);
  const setLayout = useAppStore((state) => state.setLayout);
  const activeWorkspaceId = useAppStore((state) => state.activeWorkspaceId);
  const workspacePathById = useAppStore((state) => state.workspacePathById);
  const projectPath = useAppStore((state) => state.projectPath);
  const projectFiles = useAppStore((state) => state.projectFiles);
  const messageFontSize = useAppStore((state) => state.settings.messageFontSize);
  const messageCodeFontSize = useAppStore((state) => state.settings.messageCodeFontSize);

  const content = typeof props.children === "string" ? props.children : "";
  const workspaceCwd = workspacePathById[activeWorkspaceId] ?? projectPath ?? "";
  const knownFilePaths = useMemo(() => new Set(projectFiles), [projectFiles]);

  function resolveFileLink(args: { href?: string }) {
    return resolveWorkspaceFileLink({
      href: args.href,
      workspaceCwd,
      knownFilePaths,
    });
  }

  async function handleFileLinkClick(args: { event: MouseEvent<HTMLAnchorElement>; href?: string }) {
    const resolved = resolveFileLink({ href: args.href });
    if (!resolved) {
      return;
    }
    args.event.preventDefault();
    await openFileFromTree({ filePath: resolved.filePath });
    setLayout({ patch: { editorVisible: true } });
  }

  return (
    <MarkdownMessage
      content={content}
      isStreaming={isStreaming}
      messageFontSize={messageFontSize}
      messageCodeFontSize={messageCodeFontSize}
      resolveFileLink={resolveFileLink}
      onFileLinkClick={handleFileLinkClick}
      renderBlockCode={({ code, language }) => (
        <CodeBlock code={code} language={language}>
          <CodeBlockHeader>
            <CodeBlockTitle>{language ?? "code"}</CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      )}
      {...props}
    />
  );
}

export function MessageToolbar(props: HTMLAttributes<HTMLDivElement>) {
  return <div className="flex items-center gap-1.5 text-sm text-muted-foreground" {...props} />;
}

export function MessageActions(props: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ml-1 mt-1 flex items-center gap-1", props.className)} {...props} />;
}

interface MessageActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  tooltip?: string;
}

export function MessageAction({ label, tooltip, className, ...props }: MessageActionProps) {
  const button = (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      className={cn("h-7 rounded-sm px-2 text-sm text-muted-foreground hover:text-foreground", className)}
      aria-label={label}
      {...props}
    />
  );

  if (!tooltip && !label) {
    return button;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top">{tooltip ?? label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface MessageBranchContextValue {
  branch: number;
  setBranch: (index: number) => void;
  total: number;
}

const MessageBranchContext = createContext<MessageBranchContextValue | null>(null);

function useMessageBranchContext() {
  const context = useContext(MessageBranchContext);
  if (!context) {
    throw new Error("MessageBranch components must be used inside <MessageBranch />.");
  }
  return context;
}

interface MessageBranchProps extends HTMLAttributes<HTMLDivElement> {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
}

export function MessageBranch({ defaultBranch = 0, onBranchChange, children, ...props }: MessageBranchProps) {
  const childArray = (Array.isArray(children) ? children : [children]).filter(Boolean);
  const total = childArray.length;
  const [branch, setBranchState] = useState(Math.min(Math.max(0, defaultBranch), Math.max(0, total - 1)));
  const setBranch = (index: number) => {
    const clamped = Math.min(Math.max(0, index), Math.max(0, total - 1));
    setBranchState(clamped);
    onBranchChange?.(clamped);
  };
  const value = useMemo(() => ({ branch, setBranch, total }), [branch, total]);

  return (
    <MessageBranchContext.Provider value={value}>
      <div {...props}>{children}</div>
    </MessageBranchContext.Provider>
  );
}

export function MessageBranchContent(props: HTMLAttributes<HTMLDivElement>) {
  const { branch } = useMessageBranchContext();
  const childArray = (Array.isArray(props.children) ? props.children : [props.children]).filter(Boolean);
  return <div className={props.className}>{childArray[branch] as ReactNode}</div>;
}

interface MessageBranchSelectorProps extends HTMLAttributes<HTMLDivElement> {
  from?: "user" | "assistant";
}

export function MessageBranchSelector({ from = "assistant", className, ...props }: MessageBranchSelectorProps) {
  return (
    <div
      className={cn("inline-flex items-center gap-1 rounded-sm border border-border/70 px-1 py-0.5", from === "user" ? "self-end" : "self-start", className)}
      {...props}
    />
  );
}

export function MessageBranchPrevious(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { branch, setBranch } = useMessageBranchContext();
  const { className, onClick, ...rest } = props;
  return (
    <button
      type="button"
      className={cn("rounded-sm p-0.5 hover:bg-secondary/70", className)}
      disabled={branch <= 0}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setBranch(branch - 1);
        }
      }}
      {...rest}
    >
      <ChevronLeft className="size-3" />
    </button>
  );
}

export function MessageBranchNext(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { branch, setBranch, total } = useMessageBranchContext();
  const { className, onClick, ...rest } = props;
  return (
    <button
      type="button"
      className={cn("rounded-sm p-0.5 hover:bg-secondary/70", className)}
      disabled={branch >= total - 1}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setBranch(branch + 1);
        }
      }}
      {...rest}
    >
      <ChevronRight className="size-3" />
    </button>
  );
}

export function MessageBranchPage(props: HTMLAttributes<HTMLSpanElement>) {
  const { branch, total } = useMessageBranchContext();
  return <span className={cn("text-[10px] text-muted-foreground", props.className)} {...props}>{branch + 1}/{total}</span>;
}

export function MessageAttachments(props: HTMLAttributes<HTMLDivElement>) {
  const hasChildren = Boolean(props.children);
  if (!hasChildren) {
    return null;
  }
  return <div className={cn("mb-2 flex flex-wrap items-center gap-2", props.className)} {...props} />;
}

interface MessageAttachmentData {
  url: string;
  mediaType?: string;
  filename?: string;
}

interface MessageAttachmentProps extends HTMLAttributes<HTMLDivElement> {
  data: MessageAttachmentData;
  onRemove?: () => void;
}

export function MessageAttachment({ data, onRemove, className, ...props }: MessageAttachmentProps) {
  const isImage = data.mediaType?.startsWith("image/");
  return (
    <div className={cn("group relative rounded-sm border border-border/70 bg-card/60 p-2", className)} {...props}>
      {isImage && data.url ? (
        <img src={data.url} alt={data.filename ?? "attachment"} className="h-24 w-24 rounded-sm object-cover" />
      ) : (
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Paperclip className="size-3.5" />
          <span className="max-w-44 truncate">{data.filename ?? "attachment"}</span>
        </div>
      )}
      {onRemove ? (
        <button
          type="button"
          className="absolute -right-2 -top-2 hidden rounded-full border border-border/80 bg-background p-0.5 group-hover:inline-flex"
          onClick={onRemove}
          aria-label="remove-attachment"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

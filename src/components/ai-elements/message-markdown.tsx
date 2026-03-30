import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import { useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function resolveMessageSizeClass(size: "base" | "lg" | "xl") {
  if (size === "xl") {
    return "text-xl";
  }
  if (size === "lg") {
    return "text-lg";
  }
  return "text-base";
}

export interface MarkdownMessageProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  isStreaming?: boolean;
  messageFontSize: "base" | "lg" | "xl";
  messageCodeFontSize: "base" | "lg" | "xl";
  onFileLinkClick?: (args: { event: MouseEvent<HTMLAnchorElement>; href?: string }) => void | Promise<void>;
  renderBlockCode?: (args: { code: string; language?: string }) => ReactNode;
}

export function MarkdownMessage({
  content,
  isStreaming,
  messageFontSize,
  messageCodeFontSize,
  onFileLinkClick,
  renderBlockCode,
  className,
  ...props
}: MarkdownMessageProps) {
  // ---------------------------------------------------------------------------
  // Stable ReactMarkdown `components` object.
  //
  // ReactMarkdown uses each component function as a React component type via
  // createElement(). If the function reference changes between renders, React
  // treats it as a *different* component and unmounts/remounts the subtree.
  // For CodeBlockContent this means losing the highlighted-HTML state and
  // flashing the un-highlighted fallback while Shiki re-runs.
  //
  // We keep the component functions stable by storing mutable props in refs
  // and reading them inside the (stable) component closures.
  // ---------------------------------------------------------------------------
  const renderBlockCodeRef = useRef(renderBlockCode);
  renderBlockCodeRef.current = renderBlockCode;
  const messageCodeFontSizeRef = useRef(messageCodeFontSize);
  messageCodeFontSizeRef.current = messageCodeFontSize;
  const onFileLinkClickRef = useRef(onFileLinkClick);
  onFileLinkClickRef.current = onFileLinkClick;

  const components = useMemo(() => ({
    hr: () => <hr className="my-4 h-px border-0 bg-border first:mt-0 last:mb-0" />,
    p: ({ children }: { children?: ReactNode }) => <p className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0">{children}</p>,
    ul: ({ children }: { children?: ReactNode }) => (
      <ul className="my-2 ml-5 list-disc pl-1 marker:text-muted-foreground [&_ol]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:my-1 [&_ul]:ml-5 [&_ul]:list-disc">
        {children}
      </ul>
    ),
    ol: ({ children }: { children?: ReactNode }) => (
      <ol className="my-2 ml-5 list-decimal pl-1 marker:text-muted-foreground [&_ol]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:my-1 [&_ul]:ml-5 [&_ul]:list-disc">
        {children}
      </ol>
    ),
    li: ({ children }: { children?: ReactNode }) => <li className="my-1 marker:text-muted-foreground [&>p]:my-0">{children}</li>,
    code: ({ className: codeClassName, children }: { className?: string; children?: ReactNode }) => {
      const lang = /language-(\w+)/.exec(codeClassName ?? "")?.[1];
      const text = String(children);
      const isBlock = Boolean(lang) || text.includes("\n");
      if (isBlock) {
        const renderFn = renderBlockCodeRef.current;
        if (renderFn) {
          return renderFn({
            code: text.replace(/\n$/, ""),
            language: lang,
          });
        }
        return <pre><code>{text.replace(/\n$/, "")}</code></pre>;
      }
      return (
        <code
          className={cn(
            "rounded bg-muted px-1 py-0.5 font-mono",
            resolveMessageSizeClass(messageCodeFontSizeRef.current),
          )}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
    a: ({ href, children }: { href?: string; children?: ReactNode }) => (
      <a
        href={href}
        className="text-primary underline underline-offset-2"
        target="_blank"
        rel="noreferrer"
        onClick={(event: MouseEvent<HTMLAnchorElement>) => void onFileLinkClickRef.current?.({ event, href })}
      >
        {children}
      </a>
    ),
    table: ({ children }: { children?: ReactNode }) => (
      <Table className="my-3 w-full table-fixed border-separate border-spacing-0 rounded-md border border-border/70 bg-card text-sm">
        {children}
      </Table>
    ),
    thead: ({ children }: { children?: ReactNode }) => <TableHeader className="bg-muted/40">{children}</TableHeader>,
    tbody: ({ children }: { children?: ReactNode }) => <TableBody>{children}</TableBody>,
    tr: ({ children }: { children?: ReactNode }) => <TableRow className="hover:bg-muted/30">{children}</TableRow>,
    th: ({ children }: { children?: ReactNode }) => (
      <TableHead className="h-auto border-r border-border/70 px-3 py-2 align-top whitespace-normal break-words [overflow-wrap:anywhere] [&_code]:whitespace-pre-wrap [&_code]:break-all last:border-r-0">
        {children}
      </TableHead>
    ),
    td: ({ children }: { children?: ReactNode }) => (
      <TableCell className="border-r border-border/70 px-3 py-2 align-top whitespace-normal break-words [overflow-wrap:anywhere] [&_code]:whitespace-pre-wrap [&_code]:break-all last:border-r-0">
        {children}
      </TableCell>
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  return (
    <div
      className={cn(
        resolveMessageSizeClass(messageFontSize),
        "leading-7",
        className,
      )}
      data-streaming={isStreaming ? "true" : undefined}
      {...props}
    >
      {isStreaming ? (
        <div className="whitespace-pre-wrap break-words">{content}</div>
      ) : (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      )}
    </div>
  );
}

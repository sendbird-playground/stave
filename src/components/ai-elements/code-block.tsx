import type { HTMLAttributes } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { createHighlighter } from "shiki";
import type { BundledLanguage } from "shiki";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";

// ---------------------------------------------------------------------------
// Singleton highlighter
// ---------------------------------------------------------------------------

const COMMON_LANGS: BundledLanguage[] = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "python",
  "bash",
  "json",
  "yaml",
  "html",
  "css",
  "rust",
  "go",
  "markdown",
  "sql",
  "diff",
];

let _highlighterPromise: ReturnType<typeof createHighlighter> | null = null;

function getHighlighter() {
  if (!_highlighterPromise) {
    _highlighterPromise = createHighlighter({
      themes: ["github-dark"],
      langs: COMMON_LANGS,
    });
  }
  return _highlighterPromise;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CodeBlockContextValue {
  code: string;
}

const CodeBlockContext = createContext<CodeBlockContextValue | null>(null);

function useCodeBlockContext() {
  const ctx = useContext(CodeBlockContext);
  if (!ctx) throw new Error("CodeBlock sub-components must be inside <CodeBlock />");
  return ctx;
}

// ---------------------------------------------------------------------------
// CodeBlock (root)
// ---------------------------------------------------------------------------

interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({ code, language, showLineNumbers, className, children, ...props }: CodeBlockProps) {
  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn("my-2 overflow-hidden rounded-md border border-border/70 text-sm", className)}
        {...props}
      >
        {children}
        <CodeBlockContent code={code} language={language} showLineNumbers={showLineNumbers} />
      </div>
    </CodeBlockContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// CodeBlockContent — async Shiki render
// ---------------------------------------------------------------------------

interface CodeBlockContentProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export function CodeBlockContent({ code, language }: CodeBlockContentProps) {
  const [html, setHtml] = useState<string | null>(null);
  const messageCodeFontSize = useAppStore((state) => state.settings.messageCodeFontSize);
  const codeSizeClass = messageCodeFontSize === "xl"
    ? "text-xl"
    : messageCodeFontSize === "lg"
      ? "text-lg"
      : "text-base";

  useEffect(() => {
    let cancelled = false;
    getHighlighter().then((hl) => {
      if (cancelled) return;
      try {
        const lang = (language ?? "bash") as BundledLanguage;
        const result = hl.codeToHtml(code, { lang, theme: "github-dark" });
        if (!cancelled) setHtml(result);
      } catch {
        if (!cancelled) setHtml(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (html) {
    return (
      <div
        className={cn(
          "overflow-x-auto [&>pre]:m-0 [&>pre]:overflow-visible [&>pre]:px-4 [&>pre]:py-3",
          codeSizeClass,
        )}
        // Shiki output is sanitised — no user content reaches dangerouslySetInnerHTML
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Fallback: plain text while highlighter loads
  return (
    <pre className={cn("overflow-x-auto bg-editor px-4 py-3 text-editor-foreground", codeSizeClass)}>
      <code>{code}</code>
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Header sub-components
// ---------------------------------------------------------------------------

export function CodeBlockHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-border/70 bg-editor-muted px-3 py-1.5",
        className,
      )}
      {...props}
    />
  );
}

export function CodeBlockTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)} {...props} />;
}

export function CodeBlockFilename({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("font-mono text-sm", className)} {...props} />;
}

export function CodeBlockActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-1", className)} {...props} />;
}

// ---------------------------------------------------------------------------
// CodeBlockCopyButton
// ---------------------------------------------------------------------------

interface CodeBlockCopyButtonProps extends Omit<HTMLAttributes<HTMLButtonElement>, "onError"> {
  onCopy?: () => void;
  onError?: (err: Error) => void;
  timeout?: number;
}

export function CodeBlockCopyButton({
  onCopy,
  onError,
  timeout = 2000,
  className,
  ...props
}: CodeBlockCopyButtonProps) {
  const { code } = useCodeBlockContext();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void copyTextToClipboard(code)
      .then(() => {
        setCopied(true);
        onCopy?.();
        setTimeout(() => setCopied(false), timeout);
      })
      .catch((error) => onError?.(error instanceof Error ? error : new Error("Clipboard write failed.")));
  };

  return (
    <button
      type="button"
      className={cn(
        "rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      onClick={handleCopy}
      aria-label="Copy code"
      title="Copy code"
      {...props}
    >
      {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
    </button>
  );
}

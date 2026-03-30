import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownMessage } from "@/components/ai-elements/message-markdown";
import { resolveWorkspaceFileLink } from "@/lib/message-file-links";

describe("MarkdownMessage", () => {
  test("renders GFM tables as HTML table markup", () => {
    const html = renderToStaticMarkup(createElement(MarkdownMessage, {
      content: [
        "Key improvements:",
        "",
        "| Before | After |",
        "| --- | --- |",
        "| Generic | Concrete |",
      ].join("\n"),
      messageFontSize: "base",
      messageCodeFontSize: "base",
    }));

    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toContain("<td");
  });

  test("renders workspace file links as inline file chips", () => {
    const knownFilePaths = new Set(["src/components/session/ChatPanel.tsx"]);
    const html = renderToStaticMarkup(createElement(MarkdownMessage, {
      content: "Open [chat panel](/tmp/stave/src/components/session/ChatPanel.tsx:42)",
      messageFontSize: "base",
      messageCodeFontSize: "base",
      resolveFileLink: ({ href }) => resolveWorkspaceFileLink({
        href,
        workspaceCwd: "/tmp/stave",
        knownFilePaths,
      }),
    }));

    expect(html).toContain('data-message-file-link="true"');
    expect(html).toContain('aria-label="Open src/components/session/ChatPanel.tsx"');
    expect(html).toContain("ChatPanel.tsx");
  });

  test("keeps external links as standard anchors", () => {
    const html = renderToStaticMarkup(createElement(MarkdownMessage, {
      content: "Visit [OpenAI](https://openai.com/)",
      messageFontSize: "base",
      messageCodeFontSize: "base",
    }));

    expect(html).toContain('href="https://openai.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('data-message-file-link="true"');
  });
});

describe("resolveWorkspaceFileLink", () => {
  test("returns workspace-relative file metadata for absolute file links", () => {
    const resolved = resolveWorkspaceFileLink({
      href: "/tmp/stave/src/App.tsx:18:4",
      workspaceCwd: "/tmp/stave",
      knownFilePaths: new Set(["src/App.tsx"]),
    });

    expect(resolved).toEqual({
      filePath: "src/App.tsx",
      fileName: "App.tsx",
    });
  });
});

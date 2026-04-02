import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownMessage } from "@/components/ai-elements/message-markdown";
import { formatFileLinkLocation, resolveWorkspaceFileLink } from "@/lib/message-file-links";

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
      messageFontSize: 18,
      messageCodeFontSize: 14,
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
      messageFontSize: 18,
      messageCodeFontSize: 14,
      resolveFileLink: ({ href }) => resolveWorkspaceFileLink({
        href,
        workspaceCwd: "/tmp/stave",
        knownFilePaths,
      }),
    }));

    expect(html).toContain('data-message-file-link="true"');
    expect(html).toContain('aria-label="Open src/components/session/ChatPanel.tsx (reference L42)"');
    expect(html).toContain("ChatPanel.tsx");
    expect(html).toContain("L42");
  });

  test("keeps repeated file references distinguishable with line labels", () => {
    const knownFilePaths = new Set(["src/components/session/ChatPanel.tsx"]);
    const html = renderToStaticMarkup(createElement(MarkdownMessage, {
      content: [
        "[first](/tmp/stave/src/components/session/ChatPanel.tsx:10)",
        "[second](/tmp/stave/src/components/session/ChatPanel.tsx:24)",
      ].join(" "),
      messageFontSize: 18,
      messageCodeFontSize: 14,
      resolveFileLink: ({ href }) => resolveWorkspaceFileLink({
        href,
        workspaceCwd: "/tmp/stave",
        knownFilePaths,
      }),
    }));

    expect(html).toContain("L10");
    expect(html).toContain("L24");
  });

  test("keeps external links as standard anchors", () => {
    const html = renderToStaticMarkup(createElement(MarkdownMessage, {
      content: "Visit [OpenAI](https://openai.com/)",
      messageFontSize: 18,
      messageCodeFontSize: 14,
    }));

    expect(html).toContain('href="https://openai.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain('data-message-file-link="true"');
  });

  test("applies numeric message and code font sizes to rendered markup", () => {
    const html = renderToStaticMarkup(createElement(MarkdownMessage, {
      content: "Use `code` here.",
      messageFontSize: 18,
      messageCodeFontSize: 14,
    }));

    expect(html).toContain('style="font-size:18px;line-height:1.68"');
    expect(html).toContain('style="font-size:14px"');
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
      line: 18,
      column: 4,
    });
  });

  test("parses hash-style line references", () => {
    const resolved = resolveWorkspaceFileLink({
      href: "/tmp/stave/src/App.tsx#L27C3",
      workspaceCwd: "/tmp/stave",
      knownFilePaths: new Set(["src/App.tsx"]),
    });

    expect(resolved).toEqual({
      filePath: "src/App.tsx",
      fileName: "App.tsx",
      line: 27,
      column: 3,
    });
  });
});

describe("formatFileLinkLocation", () => {
  test("formats line and column labels for file chips", () => {
    expect(formatFileLinkLocation({ line: 42 })).toBe("L42");
    expect(formatFileLinkLocation({ line: 42, column: 7 })).toBe("L42:C7");
    expect(formatFileLinkLocation({})).toBeNull();
  });
});

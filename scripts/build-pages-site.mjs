import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const repoRoot = process.cwd();
const landingRoot = path.join(repoRoot, "landing");
const docsRoot = path.join(repoRoot, "docs");
const outputRoot = path.join(repoRoot, ".pages-dist");

const docPreviewImageByRelativePath = {
  "install-guide.md": "screenshots/stave-app.png",
  "features/integrated-terminal.md": "screenshots/integrated-terminal.png",
  "features/command-palette.md": "screenshots/command-palette.png",
  "features/workspace-latest-turn-summary.md": "screenshots/information-panel.png",
  "features/skill-selector.md": "screenshots/skills-panel.png",
  "features/workspace-scripts.md": "screenshots/scripts-panel.png",
  "features/notifications.md": "screenshots/notifications.png",
  "features/local-mcp-user-guide.md": "screenshots/mcp-settings.png",
  "features/project-instructions.md": "screenshots/project-instructions.png",
  "features/provider-sandbox-and-approval.md": "screenshots/provider-controls-claude.png",
  "features/language-intelligence.md": "screenshots/language-intelligence.png",
  "features/zen-mode.md": "screenshots/workspace-mode.png",
};

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toText(value) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(toText).join("");
  }
  if (React.isValidElement(value)) {
    return toText(value.props.children);
  }
  return "";
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function collectMarkdownFiles(rootDir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files.sort();
}

function parseDocsNavigation(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      current = {
        title: headingMatch[1].trim(),
        items: [],
      };
      sections.push(current);
      continue;
    }

    const itemMatch = line.match(/^- \[(.+?)\]\((.+?)\)/);
    if (itemMatch && current) {
      current.items.push({
        title: itemMatch[1].trim(),
        href: itemMatch[2].trim(),
      });
    }
  }

  return sections;
}

function docOutputPath(sourcePath) {
  if (sourcePath === path.join(repoRoot, "README.md")) {
    return path.join(outputRoot, "index.html");
  }

  const relative = path.relative(docsRoot, sourcePath);
  if (relative === "README.md") {
    return path.join(outputRoot, "docs", "index.html");
  }
  return path.join(outputRoot, "docs", relative.replace(/\.md$/, ".html"));
}

function relativeHref(fromFile, toFile) {
  return path
    .relative(path.dirname(fromFile), toFile)
    .split(path.sep)
    .join("/");
}

function resolveDocHref(fromSourcePath, target) {
  if (
    target.startsWith("http://")
    || target.startsWith("https://")
    || target.startsWith("mailto:")
    || target.startsWith("#")
  ) {
    return target;
  }

  const [targetPath, hash = ""] = target.split("#");
  const resolvedSourcePath = path.resolve(path.dirname(fromSourcePath), targetPath);

  if (resolvedSourcePath === path.join(repoRoot, "README.md")) {
    const href = relativeHref(
      docOutputPath(fromSourcePath),
      path.join(outputRoot, "index.html"),
    );
    return hash ? `${href}#${hash}` : href;
  }

  if (resolvedSourcePath.startsWith(docsRoot) && resolvedSourcePath.endsWith(".md")) {
    const href = relativeHref(
      docOutputPath(fromSourcePath),
      docOutputPath(resolvedSourcePath),
    );
    return hash ? `${href}#${hash}` : href;
  }

  if (resolvedSourcePath.startsWith(docsRoot)) {
    const outputAssetPath = path.join(
      outputRoot,
      "docs",
      path.relative(docsRoot, resolvedSourcePath),
    );
    const href = relativeHref(docOutputPath(fromSourcePath), outputAssetPath);
    return hash ? `${href}#${hash}` : href;
  }

  return target;
}

function transformMarkdownLinks(markdown, sourcePath) {
  return markdown.replace(
    /(!?\[[^\]]*?\])\(([^)]+)\)/g,
    (_match, label, target) =>
      `${label}(${resolveDocHref(sourcePath, target.trim())})`,
  );
}

function stripInlineMarkdown(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .trim();
}

function extractDocTitle(rawMarkdown, sourcePath) {
  const titleMatch = rawMarkdown.match(/^#\s+(.+)$/m);
  return titleMatch?.[1]?.trim() ?? path.basename(sourcePath, ".md");
}

function extractDocDescription(rawMarkdown) {
  const paragraphs = rawMarkdown
    .replace(/^#\s+.+$/m, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    if (
      paragraph.startsWith("##")
      || paragraph.startsWith("###")
      || paragraph.startsWith("- ")
      || paragraph.startsWith("* ")
      || paragraph.startsWith("1.")
      || paragraph.startsWith("```")
      || paragraph.startsWith("![")
      || paragraph.startsWith("|")
      || paragraph.startsWith("<")
    ) {
      continue;
    }

    const cleaned = stripInlineMarkdown(paragraph);
    if (
      cleaned.length > 0
      && !cleaned.startsWith("This rendered example shows")
      && !cleaned.endsWith(":")
    ) {
      return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
    }
  }

  const bulletLines = rawMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .map(stripInlineMarkdown)
    .filter(
      (line) =>
        line.length > 0
        && !line.endsWith(":")
        && !line.startsWith("This rendered example shows"),
    );

  if (bulletLines.length > 0) {
    const cleaned = bulletLines[0];
    return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
  }

  return "Reference documentation for Stave.";
}

function createMarkdownComponents(headings) {
  const slugCounts = new Map();

  function nextHeadingId(rawText) {
    const base = slugify(rawText) || "section";
    const nextCount = (slugCounts.get(base) ?? 0) + 1;
    slugCounts.set(base, nextCount);
    return nextCount === 1 ? base : `${base}-${nextCount}`;
  }

  function headingRenderer(tagName, level) {
    return function Heading(props) {
      const text = toText(props.children);
      const id = nextHeadingId(text);
      headings.push({ level, text, id });
      return React.createElement(tagName, { id }, props.children);
    };
  }

  return {
    h1: headingRenderer("h1", 1),
    h2: headingRenderer("h2", 2),
    h3: headingRenderer("h3", 3),
    a(props) {
      const isExternal =
        typeof props.href === "string"
        && (props.href.startsWith("http://") || props.href.startsWith("https://"));
      return React.createElement(
        "a",
        {
          href: props.href,
          target: isExternal ? "_blank" : undefined,
          rel: isExternal ? "noreferrer" : undefined,
        },
        props.children,
      );
    },
    img(props) {
      return React.createElement("img", {
        src: props.src,
        alt: props.alt ?? "",
        loading: "lazy",
      });
    },
  };
}

function buildDocsSidebar(sections, currentSourcePath) {
  const currentOutputPath = docOutputPath(currentSourcePath);
  return sections
    .map((section) => {
      const items = section.items
        .map((item) => {
          const targetSource = path.resolve(docsRoot, item.href);
          if (!targetSource.endsWith(".md")) {
            return "";
          }
          const targetOutput = docOutputPath(targetSource);
          const href = relativeHref(currentOutputPath, targetOutput);
          const isActive =
            path.normalize(targetSource) === path.normalize(currentSourcePath);
          return `<li><a href="${escapeHtml(href)}"${
            isActive ? ' aria-current="page"' : ""
          }>${escapeHtml(item.title)}</a></li>`;
        })
        .join("");

      if (!items) {
        return "";
      }

      return `
        <section class="docs-nav-group">
          <h2>${escapeHtml(section.title)}</h2>
          <ul>${items}</ul>
        </section>
      `;
    })
    .join("");
}

function buildDocsToc(headings) {
  const relevant = headings.filter((item) => item.level >= 2 && item.level <= 3);
  if (relevant.length === 0) {
    return "";
  }

  return `
    <nav class="docs-toc" aria-label="On this page">
      <p>On this page</p>
      <ul>
        ${relevant
          .map(
            (item) =>
              `<li class="level-${item.level}"><a href="#${escapeHtml(
                item.id,
              )}">${escapeHtml(item.text)}</a></li>`,
          )
          .join("")}
      </ul>
    </nav>
  `;
}

function renderDocPage(args) {
  const rootHref = relativeHref(args.outputPath, path.join(outputRoot, "index.html"));
  const docsHomeHref = relativeHref(
    args.outputPath,
    path.join(outputRoot, "docs", "index.html"),
  );
  const githubHref = `https://github.com/sendbird-playground/stave/blob/main/${path
    .relative(repoRoot, args.sourcePath)
    .split(path.sep)
    .join("/")}`;
  const docsCssHref = relativeHref(
    args.outputPath,
    path.join(outputRoot, "landing-docs.css"),
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(args.title)} · Stave Docs</title>
    <meta name="description" content="${escapeHtml(args.description)}" />
    <link rel="icon" href="${escapeHtml(
      relativeHref(args.outputPath, path.join(outputRoot, "assets", "stave-logo-dark.svg")),
    )}" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="${escapeHtml(docsCssHref)}" />
  </head>
  <body class="docs-body">
    <header class="docs-header">
      <div class="docs-header__inner">
        <a class="docs-brand" href="${escapeHtml(rootHref)}">
          <img src="${escapeHtml(
            relativeHref(args.outputPath, path.join(outputRoot, "assets", "stave-logo-dark.svg")),
          )}" alt="Stave" width="28" height="28" />
          <span>Stave</span>
        </a>
        <nav class="docs-header__nav" aria-label="Docs navigation">
          <a href="${escapeHtml(rootHref)}">Home</a>
          <a href="${escapeHtml(docsHomeHref)}">Docs</a>
          <a href="${escapeHtml(githubHref)}" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </header>
    <main class="docs-layout">
      <aside class="docs-sidebar">
        <a class="docs-sidebar__home" href="${escapeHtml(docsHomeHref)}">Documentation</a>
        ${args.sidebarHtml}
      </aside>
      <article class="docs-content">
        <div class="docs-content__meta">
          <span>${escapeHtml(args.sectionLabel)}</span>
          <a href="${escapeHtml(githubHref)}" target="_blank" rel="noreferrer">View source</a>
        </div>
        <div class="docs-prose">
          ${args.contentHtml}
        </div>
      </article>
      ${args.tocHtml}
    </main>
  </body>
</html>`;
}

function renderDocsIndex(args) {
  const sectionsHtml = args.sections
    .map((section) => {
      const cards = section.items
        .map((item) => {
          const targetSource = path.resolve(docsRoot, item.href);
          if (!targetSource.endsWith(".md")) {
            return "";
          }
          const meta = args.docMetaBySource.get(targetSource);
          const href = relativeHref(
            path.join(outputRoot, "docs", "index.html"),
            docOutputPath(targetSource),
          );
          const imageHtml = meta?.image
            ? `<div class="docs-index-card__media"><img src="${escapeHtml(
                meta.image,
              )}" alt="${escapeHtml(meta.title)}" /></div>`
            : "";

          return `
            <a class="docs-index-card" href="${escapeHtml(href)}">
              ${imageHtml}
              <div class="docs-index-card__body">
                <span class="docs-index-card__title">${escapeHtml(meta?.title ?? item.title)}</span>
                <span class="docs-index-card__description">${escapeHtml(
                  meta?.description ?? "Reference documentation for Stave.",
                )}</span>
              </div>
              <span class="docs-index-card__arrow">→</span>
            </a>
          `;
        })
        .join("");

      if (!cards) {
        return "";
      }

      return `
        <section class="docs-index-section">
          <div class="docs-index-section__header">
            <h2>${escapeHtml(section.title)}</h2>
          </div>
          <div class="docs-index-grid">${cards}</div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Stave Docs</title>
    <meta name="description" content="Install guides, feature guides, architecture notes, and developer reference for Stave." />
    <link rel="icon" href="../assets/stave-logo-dark.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="../landing-docs.css" />
  </head>
  <body class="docs-body docs-home">
    <header class="docs-header">
      <div class="docs-header__inner">
        <a class="docs-brand" href="../index.html">
          <img src="../assets/stave-logo-dark.svg" alt="Stave" width="28" height="28" />
          <span>Stave</span>
        </a>
        <nav class="docs-header__nav" aria-label="Docs navigation">
          <a href="../index.html">Home</a>
          <a href="./index.html" aria-current="page">Docs</a>
          <a href="https://github.com/sendbird-playground/stave" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </header>
    <main class="docs-home-main">
      <section class="docs-home-hero">
        <div class="docs-home-hero__copy">
          <p class="docs-eyebrow">Documentation</p>
          <h1>Install Stave, learn the workflow, and keep the rest within reach.</h1>
          <p class="docs-home-lead">
            Start with the install path and the most-used product guides. Architecture and contributor docs stay here too, but they no longer block basic onboarding.
          </p>
          <div class="docs-home-actions">
            <a class="docs-button docs-button--primary" href="./install-guide.html">Open Install Guide</a>
            <a class="docs-button docs-button--secondary" href="../index.html">Back to product site</a>
          </div>
        </div>
        <div class="docs-home-hero__media">
          <img src="./screenshots/stave-app.png" alt="Stave desktop workspace" />
        </div>
      </section>

      <section class="docs-screenshot-strip">
        <figure>
          <img src="./screenshots/stave-app.png" alt="Stave workspace overview" />
          <figcaption>Workspace overview</figcaption>
        </figure>
        <figure>
          <img src="./screenshots/integrated-terminal.png" alt="Integrated terminal" />
          <figcaption>Integrated terminal</figcaption>
        </figure>
        <figure>
          <img src="./screenshots/command-palette.png" alt="Command palette" />
          <figcaption>Command palette</figcaption>
        </figure>
        <figure>
          <img src="./screenshots/information-panel.png" alt="Information panel" />
          <figcaption>Information panel</figcaption>
        </figure>
        <figure>
          <img src="./screenshots/skills-panel.png" alt="Skills panel" />
          <figcaption>Skills panel</figcaption>
        </figure>
        <figure>
          <img src="./screenshots/mcp-settings.png" alt="Local MCP settings" />
          <figcaption>Local MCP settings</figcaption>
        </figure>
        <figure>
          <img src="./screenshots/project-instructions.png" alt="Project instructions settings" />
          <figcaption>Project instructions</figcaption>
        </figure>
        <figure>
          <img src="./screenshots/provider-controls-codex.png" alt="Provider controls" />
          <figcaption>Provider controls</figcaption>
        </figure>
      </section>

      ${sectionsHtml}
    </main>
  </body>
</html>`;
}

async function buildDocPages(navSections, allDocs, docMetaBySource) {
  for (const sourcePath of allDocs) {
    if (path.relative(docsRoot, sourcePath) === "README.md") {
      continue;
    }

    const rawMarkdown = await readFile(sourcePath, "utf8");
    const markdown = transformMarkdownLinks(rawMarkdown, sourcePath);
    const headings = [];
    const contentHtml = renderToStaticMarkup(
      React.createElement(
        ReactMarkdown,
        {
          remarkPlugins: [remarkGfm],
          components: createMarkdownComponents(headings),
        },
        markdown,
      ),
    );
    const meta = docMetaBySource.get(sourcePath);
    const sectionMatch = navSections.find((section) =>
      section.items.some((item) => path.resolve(docsRoot, item.href) === sourcePath),
    );
    const outputPath = docOutputPath(sourcePath);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      renderDocPage({
        title: meta?.title ?? extractDocTitle(rawMarkdown, sourcePath),
        description: meta?.description ?? extractDocDescription(rawMarkdown),
        sectionLabel: sectionMatch?.title ?? "Documentation",
        sourcePath,
        outputPath,
        sidebarHtml: buildDocsSidebar(navSections, sourcePath),
        tocHtml: buildDocsToc(headings),
        contentHtml,
      }),
      "utf8",
    );
  }
}

async function main() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  await cp(landingRoot, outputRoot, { recursive: true });
  await cp(
    path.join(docsRoot, "screenshots"),
    path.join(outputRoot, "docs", "screenshots"),
    {
      recursive: true,
    },
  );
  await cp(
    path.join(docsRoot, "screenshots", "stave-app.png"),
    path.join(outputRoot, "assets", "stave-app.png"),
  );
  await cp(path.join(landingRoot, "docs.css"), path.join(outputRoot, "landing-docs.css"));

  const docsReadme = await readFile(path.join(docsRoot, "README.md"), "utf8");
  const navSections = parseDocsNavigation(docsReadme);
  const allDocs = await collectMarkdownFiles(docsRoot);

  const docMetaBySource = new Map();
  for (const sourcePath of allDocs) {
    const rawMarkdown = await readFile(sourcePath, "utf8");
    const relative = path.relative(docsRoot, sourcePath);
    const image = docPreviewImageByRelativePath[relative]
      ? `./${docPreviewImageByRelativePath[relative]}`
      : null;
    docMetaBySource.set(sourcePath, {
      title: extractDocTitle(rawMarkdown, sourcePath),
      description: extractDocDescription(rawMarkdown),
      image,
    });
  }

  await buildDocPages(navSections, allDocs, docMetaBySource);
  await writeFile(
    path.join(outputRoot, "docs", "index.html"),
    renderDocsIndex({ sections: navSections, docMetaBySource }),
    "utf8",
  );
}

await main();

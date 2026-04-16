import React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ArrowRight,
  BookOpenText,
  Bot,
  FolderTree,
  PanelLeft,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type SiteDoc = {
  routePath: string
  sourcePath: string
  title: string
  description: string
  previewImage?: string
  featured?: boolean
  content: string
}

type SiteSection = {
  id: string
  title: string
  description: string
  docs: SiteDoc[]
}

type SiteData = {
  sections: SiteSection[]
}

const docsIntroCards = [
  {
    title: "Task-aware workspace",
    description: "Keep chat, files, terminal work, summaries, and workspace references in one place instead of scattering context across tools.",
    icon: FolderTree,
  },
  {
    title: "Claude and Codex controls",
    description: "Choose the provider path that matches the task and keep approvals, queued follow-ups, and runtime behavior visible.",
    icon: Bot,
  },
  {
    title: "Local automation",
    description: "Use the built-in local MCP path, project instructions, and scripts without turning the app into a developer-only dashboard.",
    icon: Sparkles,
  },
]

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function extractHeadings(markdown: string) {
  const slugCounts = new Map<string, number>()

  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{2,3})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => {
      const depth = match?.[1].length ?? 2
      const rawText = match?.[2].trim() ?? ""
      const base = slugify(rawText) || "section"
      const nextCount = (slugCounts.get(base) ?? 0) + 1
      slugCounts.set(base, nextCount)

      return {
        depth,
        text: rawText,
        id: nextCount === 1 ? base : `${base}-${nextCount}`,
      }
    })
}

function docHref(currentRoute: string | null, targetRoute: string | null) {
  if (!currentRoute || currentRoute === "home") {
    return targetRoute ? `./${targetRoute}/` : "./"
  }

  if (!targetRoute) {
    return "../"
  }

  if (currentRoute === targetRoute) {
    return "./"
  }

  return `../${targetRoute}/`
}

function docsHomeHref(currentRoute: string | null) {
  return docHref(currentRoute, null)
}

function siteUrl(pathname: string) {
  return pathname
}

function findSectionForRoute(data: SiteData, routePath: string | null) {
  if (!routePath) {
    return null
  }

  return data.sections.find((section) =>
    section.docs.some((doc) => doc.routePath === routePath),
  ) ?? null
}

function findDocForRoute(data: SiteData, routePath: string | null) {
  if (!routePath || routePath === "home") {
    return null
  }

  for (const section of data.sections) {
    for (const doc of section.docs) {
      if (doc.routePath === routePath) {
        return doc
      }
    }
  }

  return null
}

function SiteHeader({
  docsHref,
  installHref,
  docsLabel = "Docs",
}: {
  docsHref: string
  installHref: string
  docsLabel?: string
}) {
  return (
    <header className="site-header">
      <div className="site-shell flex items-center justify-between gap-4 py-4">
        <a className="site-brand" href={siteUrl("/")}>
          <span className="site-brand__mark" />
          <span>Stave</span>
        </a>
        <nav className="site-nav">
          <a className="site-nav__link" href={docsHref}>{docsLabel}</a>
          <a className="site-nav__link" href={installHref}>Install</a>
          <a
            className="site-nav__link"
            href="https://github.com/sendbird-playground/stave"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}

function SiteFooter({ docsHref, installHref }: { docsHref: string; installHref: string }) {
  return (
    <footer className="site-footer">
      <div className="site-shell flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="site-brand text-sm">
            <span className="site-brand__mark" />
            <span>Stave</span>
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            Desktop AI coding workspace for Claude and Codex. Public docs stay focused on how to use the product.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <a className="hover:text-foreground" href={docsHref}>Docs</a>
          <a className="hover:text-foreground" href={installHref}>Install</a>
          <a
            className="hover:text-foreground"
            href="https://github.com/sendbird-playground/stave"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  )
}

function DocCard({
  doc,
  href,
  previewSrc,
  compact = false,
}: {
  doc: SiteDoc
  href: string
  previewSrc?: string
  compact?: boolean
}) {
  return (
    <a className="block h-full" href={href}>
      <Card className={cn("site-card h-full rounded-2xl border-border/70 bg-card/92 transition-transform duration-200 hover:-translate-y-0.5 hover:border-foreground/15", compact && "overflow-hidden")}>
        {compact && previewSrc ? (
          <div className="border-b border-border/70 bg-muted/70 px-4 py-4">
            <img
              alt={doc.title}
              className="site-preview-image"
              loading="lazy"
              src={previewSrc}
            />
          </div>
        ) : null}
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-lg">{doc.title}</CardTitle>
            <ArrowRight className="size-4 text-muted-foreground" />
          </div>
          <CardDescription className="text-sm leading-6">
            {doc.description}
          </CardDescription>
        </CardHeader>
      </Card>
    </a>
  )
}

export function LandingPage({ data }: { data: SiteData }) {
  const featuredDocs = data.sections.flatMap((section) =>
    section.docs.filter((doc) => doc.featured),
  )

  return (
    <div className="site-root">
      <SiteHeader docsHref="./docs/" installHref="./docs/install-guide/" />
      <main>
        <section className="hero-section">
          <div className="site-shell hero-grid">
            <div className="space-y-6">
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
                Desktop AI coding workspace
              </Badge>
              <div className="space-y-4">
                <h1 className="max-w-3xl font-heading text-4xl leading-tight font-semibold text-balance sm:text-5xl lg:text-6xl">
                  Claude and Codex, with the rest of the workspace kept intact.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                  Stave keeps task chat, terminal work, repo context, notes, and provider controls in one desktop app so the work stays grounded in the actual project.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <a href="./docs/install-guide/">
                    Install Stave
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="./docs/">
                    Browse Docs
                  </a>
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {docsIntroCards.map((item) => {
                  const Icon = item.icon
                  return (
                    <Card key={item.title} className="site-card rounded-2xl border-border/70 bg-card/84">
                      <CardHeader className="gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background">
                          <Icon className="size-4 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-base">{item.title}</CardTitle>
                        <CardDescription className="leading-6">
                          {item.description}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  )
                })}
              </div>
            </div>
            <div className="space-y-4">
              <Card className="site-card overflow-hidden rounded-[28px] border-border/70 bg-card/96 p-0">
                <div className="site-window-bar">
                  <span />
                  <span />
                  <span />
                </div>
                <img
                  alt="Stave workspace overview"
                  className="w-full"
                  loading="eager"
                  src="./docs/screenshots/stave-app.png"
                />
              </Card>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="site-card rounded-2xl border-border/70 bg-card/88">
                  <CardHeader className="gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <TerminalSquare className="size-4" />
                      Integrated terminal
                    </div>
                    <CardDescription className="leading-6">
                      Keep the docked terminal and full-panel CLI sessions close to the task instead of bouncing out to another app.
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card className="site-card rounded-2xl border-border/70 bg-card/88">
                  <CardHeader className="gap-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ShieldCheck className="size-4" />
                      Provider controls
                    </div>
                    <CardDescription className="leading-6">
                      Runtime setup, approvals, and staged follow-ups stay visible without turning the app into a wall of settings.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="site-section">
          <div className="site-shell space-y-6">
            <div className="space-y-3">
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
                Public docs
              </Badge>
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="space-y-3">
                  <h2 className="font-heading text-3xl font-semibold tracking-tight">
                    Use the docs like a product manual, not a contributor dump.
                  </h2>
                  <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                    The docs now prioritize install, core workflows, and feature usage. Contributor and architecture material stays out of the public navigation.
                  </p>
                </div>
                <Button asChild variant="outline">
                  <a href="./docs/">
                    Open docs home
                    <BookOpenText className="size-4" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {featuredDocs.map((doc) => (
                <DocCard
                  key={doc.routePath}
                  compact
                  doc={doc}
                  href={`./docs/${doc.routePath}/`}
                  previewSrc={doc.previewImage ? `./docs/${doc.previewImage}` : undefined}
                />
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter docsHref="./docs/" installHref="./docs/install-guide/" />
    </div>
  )
}

function MarkdownContent({ markdown }: { markdown: string }) {
  const headingIds = React.useMemo(() => extractHeadings(markdown), [markdown])
  const headingIndexRef = React.useRef(0)
  headingIndexRef.current = 0

  return (
    <ReactMarkdown
      components={{
        a: ({ children, href, ...props }) => {
          const isExternal = typeof href === "string" && /^https?:\/\//.test(href)
          return (
            <a
              className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
              href={href}
              rel={isExternal ? "noreferrer" : undefined}
              target={isExternal ? "_blank" : undefined}
              {...props}
            >
              {children}
            </a>
          )
        },
        h1: ({ children }) => (
          <h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight text-balance">
            {children}
          </h1>
        ),
        h2: ({ children }) => {
          const heading = headingIds[headingIndexRef.current]
          headingIndexRef.current += 1
          return (
            <h2 className="mt-12 scroll-mt-24 font-heading text-2xl font-semibold tracking-tight" id={heading?.id}>
              {children}
            </h2>
          )
        },
        h3: ({ children }) => {
          const heading = headingIds[headingIndexRef.current]
          headingIndexRef.current += 1
          return (
            <h3 className="mt-8 scroll-mt-24 font-heading text-xl font-semibold tracking-tight" id={heading?.id}>
              {children}
            </h3>
          )
        },
        p: ({ children }) => (
          <p className="leading-8 text-foreground/92">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="ml-5 list-disc space-y-2 text-foreground/92 marker:text-muted-foreground">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="ml-5 list-decimal space-y-3 text-foreground/92 marker:text-muted-foreground">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="rounded-r-2xl border-l-2 border-border bg-muted/40 px-5 py-3 text-muted-foreground">
            {children}
          </blockquote>
        ),
        code: ({ className, children }) => {
          const isInline = !className
          if (isInline) {
            return (
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.92em]">
                {children}
              </code>
            )
          }

          return (
            <code className={cn("block overflow-x-auto rounded-2xl bg-foreground px-4 py-4 font-mono text-sm text-background", className)}>
              {children}
            </code>
          )
        },
        pre: ({ children }) => <pre className="overflow-hidden">{children}</pre>,
        table: ({ children }) => (
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <table className="w-full border-collapse text-left text-sm">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
        th: ({ children }) => (
          <th className="border-b border-border/70 px-4 py-3 font-medium">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border-b border-border/60 px-4 py-3 align-top">{children}</td>
        ),
        hr: () => <hr className="my-10 border-border/70" />,
        img: ({ alt, src }) => (
          <figure className="space-y-3">
            <img alt={alt ?? ""} className="site-preview-image rounded-2xl border border-border/70 bg-card" loading="lazy" src={src} />
            {alt ? <figcaption className="text-sm text-muted-foreground">{alt}</figcaption> : null}
          </figure>
        ),
      }}
      remarkPlugins={[remarkGfm]}
    >
      {markdown}
    </ReactMarkdown>
  )
}

function DocsSidebar({
  data,
  currentRoute,
}: {
  data: SiteData
  currentRoute: string | null
}) {
  return (
    <aside className="docs-sidebar">
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Public docs
          </p>
          <a className="inline-flex items-center gap-2 text-sm font-medium text-foreground" href={docsHomeHref(currentRoute)}>
            <PanelLeft className="size-4 text-muted-foreground" />
            Docs home
          </a>
        </div>
        {data.sections.map((section) => (
          <div key={section.id} className="space-y-2.5">
            <div>
              <h2 className="text-sm font-medium text-foreground">{section.title}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{section.description}</p>
            </div>
            <div className="space-y-1.5">
              {section.docs.map((doc) => (
                <a
                  key={doc.routePath}
                  className={cn(
                    "docs-sidebar__link",
                    currentRoute === doc.routePath && "docs-sidebar__link--active",
                  )}
                  href={docHref(currentRoute, doc.routePath)}
                >
                  {doc.title}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

function DocsHome({ data }: { data: SiteData }) {
  const featuredDocs = data.sections.flatMap((section) =>
    section.docs.filter((doc) => doc.featured),
  )

  return (
    <div className="space-y-12">
      <section className="space-y-5">
        <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
          Stave Docs
        </Badge>
        <div className="space-y-4">
          <h1 className="max-w-4xl font-heading text-4xl leading-tight font-semibold tracking-tight text-balance">
            End-user docs for installing Stave, learning the main surfaces, and using its core workflows well.
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
            This site is intentionally product-facing. It covers install, feature usage, and workflow reference. Contributor and internal engineering material stays separate from this navigation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href="./install-guide/">
              Start with install
              <ArrowRight className="size-4" />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="https://github.com/sendbird-playground/stave" target="_blank" rel="noreferrer">
              Repository
            </a>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {featuredDocs.map((doc) => (
          <DocCard
            key={doc.routePath}
            compact
            doc={doc}
            href={`./${doc.routePath}/`}
            previewSrc={doc.previewImage ? `./${doc.previewImage}` : undefined}
          />
        ))}
      </section>

      <section className="space-y-8">
        {data.sections.map((section) => (
          <div key={section.id} className="space-y-4">
            <div className="space-y-2">
              <h2 className="font-heading text-2xl font-semibold tracking-tight">{section.title}</h2>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">{section.description}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {section.docs.map((doc) => (
                <DocCard
                  key={doc.routePath}
                  doc={doc}
                  href={`./${doc.routePath}/`}
                  previewSrc={doc.previewImage ? `./${doc.previewImage}` : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

function DocsPage({
  data,
  routePath,
}: {
  data: SiteData
  routePath: string
}) {
  const doc = findDocForRoute(data, routePath)
  const section = findSectionForRoute(data, routePath)
  const headings = React.useMemo(() => {
    if (!doc) {
      return []
    }
    return extractHeadings(doc.content).filter((heading) => heading.depth <= 3)
  }, [doc])

  if (!doc || !section) {
    return (
      <Card className="site-card rounded-2xl border-border/70 bg-card/92">
        <CardHeader className="space-y-3">
          <CardTitle>Document not found</CardTitle>
          <CardDescription>
            This page is not part of the public Stave docs build.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <a href="../">Go back to docs home</a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="docs-content-grid">
      <article className="space-y-8">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase">
              {section.title}
            </Badge>
            <a className="text-sm text-muted-foreground hover:text-foreground" href="../">
              Docs home
            </a>
          </div>
          <div className="space-y-3">
            <h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight text-balance">
              {doc.title}
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
              {doc.description}
            </p>
          </div>
          {doc.previewImage ? (
            <img
              alt={doc.title}
              className="site-preview-image rounded-[28px] border border-border/70 bg-card"
              loading="eager"
              src={`../${doc.previewImage}`}
            />
          ) : null}
        </div>
        <div className="docs-prose">
          <MarkdownContent markdown={doc.content} />
        </div>
      </article>
      <aside className="docs-toc">
        <div className="docs-toc__inner">
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            On this page
          </p>
          <div className="mt-4 space-y-1.5">
            {headings.length > 0 ? headings.map((heading) => (
              <a
                key={heading.id}
                className={cn(
                  "docs-toc__link",
                  heading.depth === 3 && "docs-toc__link--nested",
                )}
                href={`#${heading.id}`}
              >
                {heading.text}
              </a>
            )) : (
              <p className="text-sm text-muted-foreground">
                This page is intentionally short.
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

export function DocsPageRoot({
  data,
  currentRoute,
}: {
  data: SiteData
  currentRoute: string | null
}) {
  const doc = findDocForRoute(data, currentRoute)

  return (
    <div className="site-root">
      <SiteHeader
        docsHref={docsHomeHref(currentRoute)}
        docsLabel="Docs home"
        installHref={docHref(currentRoute, "install-guide")}
      />
      <main className="site-section pt-8">
        <div className="site-shell docs-layout">
          <DocsSidebar data={data} currentRoute={currentRoute} />
          <section className="min-w-0">
            {currentRoute && currentRoute !== "home" ? (
              <DocsPage data={data} routePath={currentRoute} />
            ) : (
              <DocsHome data={data} />
            )}
          </section>
        </div>
      </main>
      <SiteFooter
        docsHref={docsHomeHref(currentRoute)}
        installHref={docHref(currentRoute, "install-guide")}
      />
    </div>
  )
}

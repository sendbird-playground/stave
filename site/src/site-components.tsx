import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowRight,
  BookOpenText,
  FolderTree,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type SiteDoc = {
  routePath: string;
  sourcePath: string;
  title: string;
  description: string;
  previewImage?: string;
  featured?: boolean;
  content: string;
};

type SiteSection = {
  id: string;
  title: string;
  description: string;
  docs: SiteDoc[];
};

type SiteData = {
  sections: SiteSection[];
};

const landingHighlights = [
  {
    title: "One task-aware workspace",
    description:
      "Keep task chat, editor context, notes, and linked resources attached to the same workspace instead of scattering them across tools.",
    icon: FolderTree,
  },
  {
    title: "Terminals and provider sessions together",
    description:
      "Run docked shell work and full Claude or Codex sessions inside the same desktop flow without losing context.",
    icon: TerminalSquare,
  },
  {
    title: "Visible safety controls",
    description:
      "Choose file access, approvals, and network behavior before a turn starts instead of hiding that logic in setup-only screens.",
    icon: ShieldCheck,
  },
];

const landingSteps = [
  {
    step: "01",
    title: "Install the desktop app",
    description:
      "Use the macOS installer flow with GitHub CLI, then launch directly into the Stave workspace.",
    href: "./docs/install-guide/",
  },
  {
    step: "02",
    title: "Learn the core surfaces",
    description:
      "Start with the integrated terminal, command palette, and runtime safety controls before moving into deeper setup.",
    href: "./docs/",
  },
  {
    step: "03",
    title: "Adopt project-level workflow",
    description:
      "Add project instructions, scripts, and local automation only when the default task workflow is already working well.",
    href: "./docs/project-instructions/",
  },
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripLeadingTitle(markdown: string) {
  return markdown.replace(/^#\s+.+?(?:\r?\n){1,2}/, "");
}

function extractHeadings(markdown: string) {
  const slugCounts = new Map<string, number>();

  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{2,3})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => {
      const depth = match?.[1].length ?? 2;
      const rawText = match?.[2].trim() ?? "";
      const base = slugify(rawText) || "section";
      const nextCount = (slugCounts.get(base) ?? 0) + 1;
      slugCounts.set(base, nextCount);

      return {
        depth,
        text: rawText,
        id: nextCount === 1 ? base : `${base}-${nextCount}`,
      };
    });
}

function docHref(currentRoute: string | null, targetRoute: string | null) {
  if (!currentRoute || currentRoute === "home") {
    return targetRoute ? `./${targetRoute}/` : "./";
  }

  if (!targetRoute) {
    return "../";
  }

  if (currentRoute === targetRoute) {
    return "./";
  }

  return `../${targetRoute}/`;
}

function docsHomeHref(currentRoute: string | null) {
  return docHref(currentRoute, null);
}

function previewHref(currentRoute: string | null, previewImage?: string) {
  if (!previewImage) {
    return undefined;
  }

  if (!currentRoute || currentRoute === "home") {
    return `./${previewImage}`;
  }

  return `../${previewImage}`;
}

function flattenDocs(data: SiteData) {
  return data.sections.flatMap((section) =>
    section.docs.map((doc) => ({
      section,
      doc,
    })),
  );
}

function findSectionForRoute(data: SiteData, routePath: string | null) {
  if (!routePath || routePath === "home") {
    return null;
  }

  return (
    data.sections.find((section) =>
      section.docs.some((doc) => doc.routePath === routePath),
    ) ?? null
  );
}

function findDocForRoute(data: SiteData, routePath: string | null) {
  if (!routePath || routePath === "home") {
    return null;
  }

  for (const section of data.sections) {
    for (const doc of section.docs) {
      if (doc.routePath === routePath) {
        return doc;
      }
    }
  }

  return null;
}

function findDocNeighbors(data: SiteData, routePath: string) {
  const docs = flattenDocs(data);
  const index = docs.findIndex((entry) => entry.doc.routePath === routePath);

  return {
    previous: index > 0 ? docs[index - 1] : null,
    next: index >= 0 && index < docs.length - 1 ? docs[index + 1] : null,
  };
}

function filterSections(data: SiteData, query: string) {
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    return data.sections;
  }

  return data.sections
    .map((section) => {
      const docs = section.docs.filter((doc) => {
        const haystack = [
          section.title,
          section.description,
          doc.title,
          doc.description,
          doc.routePath,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(trimmed);
      });

      return {
        ...section,
        docs,
      };
    })
    .filter((section) => section.docs.length > 0);
}

function SiteHeader({
  docsHref,
  installHref,
}: {
  docsHref: string;
  installHref: string;
}) {
  return (
    <header className="site-header">
      <div className="site-shell flex items-center justify-between gap-4 py-4">
        <a className="site-brand" href="/">
          <span className="site-brand__mark" />
          <span>Stave</span>
        </a>
        <nav className="site-nav">
          <a className="site-nav__link" href={docsHref}>
            Docs
          </a>
          <a className="site-nav__link" href={installHref}>
            Install
          </a>
          <a
            className="site-nav__link"
            href="https://github.com/sendbird-playground/stave"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter({
  docsHref,
  installHref,
}: {
  docsHref: string;
  installHref: string;
}) {
  return (
    <footer className="site-footer">
      <div className="site-shell flex flex-col gap-4 py-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="site-brand text-sm">
            <span className="site-brand__mark" />
            <span>Stave</span>
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            Desktop AI coding workspace for Claude and Codex, with public docs
            focused on product usage rather than repository internals.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <a className="hover:text-foreground" href={docsHref}>
            Docs
          </a>
          <a className="hover:text-foreground" href={installHref}>
            Install
          </a>
          <a
            className="hover:text-foreground"
            href="https://github.com/sendbird-playground/stave"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

function DocPreviewCard({
  doc,
  href,
  previewSrc,
}: {
  doc: SiteDoc;
  href: string;
  previewSrc?: string;
}) {
  return (
    <a className="block h-full" href={href}>
      <Card className="site-panel h-full overflow-hidden rounded-3xl border-border/70 bg-card/96 transition-colors hover:border-foreground/12">
        {previewSrc ? (
          <div className="border-b border-border/70 bg-muted/50 p-4">
            <div className="site-preview-frame">
              <img
                alt={doc.title}
                className="site-preview-image site-preview-image--framed"
                loading="lazy"
                src={previewSrc}
              />
            </div>
          </div>
        ) : null}
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge
                className="rounded-full px-2.5 py-0.5 text-[11px]"
                variant="secondary"
              >
                Guide
              </Badge>
              <CardTitle className="text-lg leading-6">{doc.title}</CardTitle>
            </div>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          </div>
          <CardDescription className="text-sm leading-6">
            {doc.description}
          </CardDescription>
        </CardHeader>
      </Card>
    </a>
  );
}

function SectionCard({
  section,
  currentRoute,
}: {
  section: SiteSection;
  currentRoute: string | null;
}) {
  return (
    <Card className="site-panel rounded-3xl border-border/70 bg-card/96">
      <CardHeader className="space-y-3">
        <div className="space-y-2">
          <CardTitle className="text-xl">{section.title}</CardTitle>
          <CardDescription className="leading-7">
            {section.description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {section.docs.map((doc, index) => (
          <div key={doc.routePath}>
            <a
              className="group flex items-start justify-between gap-4 rounded-2xl px-1 py-1 text-sm transition-colors hover:text-foreground"
              href={docHref(currentRoute, doc.routePath)}
            >
              <div className="space-y-1">
                <div className="font-medium text-foreground">{doc.title}</div>
                <p className="text-muted-foreground">{doc.description}</p>
              </div>
              <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </a>
            {index < section.docs.length - 1 ? (
              <Separator className="my-3" />
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LandingStepCard({
  step,
  title,
  description,
  href,
}: {
  step: string;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Card className="site-panel rounded-3xl border-border/70 bg-card/96">
      <CardHeader className="space-y-4">
        <Badge
          className="w-fit rounded-full px-2.5 py-0.5 text-[11px]"
          variant="secondary"
        >
          Step {step}
        </Badge>
        <div className="space-y-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription className="leading-6">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full justify-between" variant="ghost">
          <a href={href}>
            Open guide
            <ArrowRight className="size-4" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

export function LandingPage({ data }: { data: SiteData }) {
  const featuredDocs = data.sections
    .flatMap((section) => section.docs.filter((doc) => doc.featured))
    .slice(0, 4);

  return (
    <div className="site-root">
      <SiteHeader docsHref="./docs/" installHref="./docs/install-guide/" />
      <main>
        <section className="landing-hero">
          <div className="site-shell">
            <div className="landing-hero__grid">
              <div className="space-y-7">
                <Badge
                  className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase"
                  variant="secondary"
                >
                  Desktop AI coding workspace
                </Badge>
                <div className="space-y-4">
                  <h1 className="max-w-4xl font-heading text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                    Stave keeps tasks, terminal work, and provider controls in
                    one desktop workspace.
                  </h1>
                  <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                    The public docs are organized like a product manual: install
                    first, learn the main surfaces next, then move into advanced
                    setup only when you need it.
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
                    <a href="./docs/">Browse docs</a>
                  </Button>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {landingHighlights.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Card
                        key={item.title}
                        className="site-panel rounded-3xl border-border/70 bg-card/94"
                      >
                        <CardHeader className="gap-3">
                          <div className="flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-background">
                            <Icon className="size-4 text-muted-foreground" />
                          </div>
                          <CardTitle className="text-base">
                            {item.title}
                          </CardTitle>
                          <CardDescription className="leading-6">
                            {item.description}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              </div>

              <Card className="site-panel overflow-hidden rounded-[32px] border-border/70 bg-card/98 p-0">
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
            </div>
          </div>
        </section>

        <section className="landing-section border-t border-border/70">
          <div className="site-shell space-y-8">
            <div className="max-w-3xl space-y-3">
              <Badge
                className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase"
                variant="secondary"
              >
                Start with the docs
              </Badge>
              <h2 className="font-heading text-3xl font-semibold tracking-tight">
                Use the public site the same way you would read a product
                manual.
              </h2>
              <p className="text-base leading-7 text-muted-foreground">
                Start with install, learn the core surfaces, then adopt
                project-level workflow features only when they are useful for
                your team.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {landingSteps.map((item) => (
                <LandingStepCard key={item.step} {...item} />
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section border-t border-border/70">
          <div className="site-shell space-y-8">
            <div className="max-w-3xl space-y-3">
              <Badge
                className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase"
                variant="secondary"
              >
                Popular guides
              </Badge>
              <h2 className="font-heading text-3xl font-semibold tracking-tight">
                The most important product guides stay near the top.
              </h2>
              <p className="text-base leading-7 text-muted-foreground">
                Contributor notes, internal architecture, and historical
                planning stay out of the public navigation so the docs remain
                focused.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {featuredDocs.map((doc) => (
                <DocPreviewCard
                  key={doc.routePath}
                  doc={doc}
                  href={`./docs/${doc.routePath}/`}
                  previewSrc={
                    doc.previewImage ? `./docs/${doc.previewImage}` : undefined
                  }
                />
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter docsHref="./docs/" installHref="./docs/install-guide/" />
    </div>
  );
}

function MarkdownContent({ markdown }: { markdown: string }) {
  const headingIds = React.useMemo(() => extractHeadings(markdown), [markdown]);
  const headingIndexRef = React.useRef(0);
  headingIndexRef.current = 0;

  return (
    <ReactMarkdown
      components={{
        a: ({ children, href, ...props }) => {
          const isExternal =
            typeof href === "string" && /^https?:\/\//.test(href);

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
          );
        },
        h1: () => null,
        h2: ({ children }) => {
          const heading = headingIds[headingIndexRef.current];
          headingIndexRef.current += 1;

          return (
            <h2
              className="mt-12 scroll-mt-24 font-heading text-2xl font-semibold tracking-tight"
              id={heading?.id}
            >
              {children}
            </h2>
          );
        },
        h3: ({ children }) => {
          const heading = headingIds[headingIndexRef.current];
          headingIndexRef.current += 1;

          return (
            <h3
              className="mt-8 scroll-mt-24 font-heading text-xl font-semibold tracking-tight"
              id={heading?.id}
            >
              {children}
            </h3>
          );
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
          const isInline = !className;

          if (isInline) {
            return (
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.92em]">
                {children}
              </code>
            );
          }

          return (
            <code
              className={cn(
                "block overflow-x-auto rounded-2xl bg-foreground px-4 py-4 font-mono text-sm text-background",
                className,
              )}
            >
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="overflow-hidden">{children}</pre>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <table className="w-full border-collapse text-left text-sm">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/60">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="border-b border-border/70 px-4 py-3 font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-border/60 px-4 py-3 align-top">
            {children}
          </td>
        ),
        hr: () => <hr className="my-10 border-border/70" />,
        img: ({ alt, src }) => (
          <figure className="space-y-3">
            <img
              alt={alt ?? ""}
              className="site-preview-image rounded-2xl border border-border/70 bg-card"
              loading="lazy"
              src={src}
            />
            {alt ? (
              <figcaption className="text-sm text-muted-foreground">
                {alt}
              </figcaption>
            ) : null}
          </figure>
        ),
      }}
      remarkPlugins={[remarkGfm]}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function DocsSidebarNav({
  data,
  currentRoute,
  query,
  onQueryChange,
}: {
  data: SiteData;
  currentRoute: string | null;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <Sidebar className="docs-sidebar-shell" collapsible="none">
      <SidebarHeader className="gap-3 border-b border-sidebar-border/80 p-3">
        <a
          className="site-brand px-2 pt-1 text-sm"
          href={docsHomeHref(currentRoute)}
        >
          <span className="site-brand__mark" />
          <span>Stave Docs</span>
        </a>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            className="pl-9"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search docs"
            value={query}
          />
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={!currentRoute || currentRoute === "home"}
                >
                  <a href={docsHomeHref(currentRoute)}>
                    <BookOpenText />
                    <span>Documentation home</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {data.sections.map((section) => (
          <SidebarGroup key={section.id}>
            <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.docs.map((doc) => (
                  <SidebarMenuItem key={doc.routePath}>
                    <SidebarMenuButton
                      asChild
                      isActive={currentRoute === doc.routePath}
                    >
                      <a href={docHref(currentRoute, doc.routePath)}>
                        <span>{doc.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="gap-2 p-3">
        <Button asChild className="w-full justify-start" variant="outline">
          <a href={docHref(currentRoute, "install-guide")}>Install guide</a>
        </Button>
        <Button asChild className="w-full justify-start" variant="ghost">
          <a
            href="https://github.com/sendbird-playground/stave"
            rel="noreferrer"
            target="_blank"
          >
            Repository
          </a>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

function DocsTopbar({
  currentRoute,
  currentTitle,
  query,
  onQueryChange,
}: {
  currentRoute: string | null;
  currentTitle: string | null;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div className="docs-topbar">
      <div className="site-shell flex items-center justify-between gap-4 py-3">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-3">
            <a className="site-brand" href="/">
              <span className="site-brand__mark" />
              <span>Stave</span>
            </a>
            <Separator
              className="hidden h-4 w-px md:block"
              orientation="vertical"
            />
            <a
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground md:block"
              href={docsHomeHref(currentRoute)}
            >
              Docs
            </a>
          </div>
          <div className="hidden min-w-0 lg:block">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href={docsHomeHref(currentRoute)}>
                    Documentation
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {currentRoute && currentRoute !== "home" ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{currentTitle ?? "Guide"}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative hidden w-72 lg:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search docs"
              value={query}
            />
          </div>
          <Button asChild className="hidden sm:inline-flex" variant="outline">
            <a href={docHref(currentRoute, "install-guide")}>Install</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function DocsHome({
  data,
  currentRoute,
  query,
}: {
  data: SiteData;
  currentRoute: string | null;
  query: string;
}) {
  const featuredDocs = data.sections
    .flatMap((section) => section.docs.filter((doc) => doc.featured))
    .slice(0, 4);

  return (
    <div className="space-y-10">
      <Card className="site-panel rounded-[32px] border-border/70 bg-card/98">
        <CardHeader className="space-y-4">
          <Badge
            className="w-fit rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase"
            variant="secondary"
          >
            Public docs
          </Badge>
          <div className="space-y-3">
            <CardTitle className="max-w-4xl text-4xl leading-tight tracking-tight text-balance">
              Learn Stave through install, core workflows, and focused product
              reference.
            </CardTitle>
            <CardDescription className="max-w-3xl text-base leading-8">
              This site is intentionally curated for end users. Contributor
              notes, internal architecture, and historical planning stay out of
              the public navigation.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href={docHref(currentRoute, "install-guide")}>
              Start with install
              <ArrowRight className="size-4" />
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/">Product overview</a>
          </Button>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            {query.trim() ? "Matching guides" : "Start here"}
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            {query.trim()
              ? "Filtered public docs based on your current search."
              : "The smallest set of guides most people should read first."}
          </p>
        </div>
        {featuredDocs.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {featuredDocs.map((doc) => (
              <DocPreviewCard
                key={doc.routePath}
                doc={doc}
                href={docHref(currentRoute, doc.routePath)}
                previewSrc={previewHref(currentRoute, doc.previewImage)}
              />
            ))}
          </div>
        ) : (
          <Card className="site-panel rounded-3xl border-border/70 bg-card/96">
            <CardHeader>
              <CardTitle className="text-lg">No matching guides</CardTitle>
              <CardDescription>
                Try a broader search term or browse the docs by section below.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <div className="space-y-2">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            Browse by section
          </h2>
          <p className="text-sm leading-7 text-muted-foreground">
            Each section groups product-facing material by usage, not by
            repository ownership.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {data.sections.map((section) => (
            <SectionCard
              key={section.id}
              currentRoute={currentRoute}
              section={section}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function DocsPage({ data, routePath }: { data: SiteData; routePath: string }) {
  const doc = findDocForRoute(data, routePath);
  const section = findSectionForRoute(data, routePath);

  if (!doc || !section) {
    return (
      <Card className="site-panel rounded-3xl border-border/70 bg-card/96">
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
    );
  }

  const markdownBody = stripLeadingTitle(doc.content);
  const headings = extractHeadings(markdownBody).filter(
    (heading) => heading.depth <= 3,
  );
  const neighbors = findDocNeighbors(data, routePath);
  const previewSrc = previewHref(routePath, doc.previewImage);

  return (
    <div className="docs-page-layout">
      <article className="min-w-0 space-y-6">
        <Card className="site-panel overflow-hidden rounded-[32px] border-border/70 bg-card/98">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                className="rounded-full px-3 py-1 text-[11px] tracking-[0.16em] uppercase"
                variant="secondary"
              >
                {section.title}
              </Badge>
            </div>
            <div className="space-y-3">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="../">Docs</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{doc.title}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <CardTitle className="text-4xl leading-tight tracking-tight text-balance">
                {doc.title}
              </CardTitle>
              <CardDescription className="max-w-3xl text-base leading-8">
                {doc.description}
              </CardDescription>
            </div>
          </CardHeader>
          {previewSrc ? (
            <CardContent className="pt-0">
              <img
                alt={doc.title}
                className="site-preview-image"
                loading="lazy"
                src={previewSrc}
              />
            </CardContent>
          ) : null}
        </Card>

        <Card className="site-panel rounded-[32px] border-border/70 bg-card">
          <CardContent className="docs-prose p-6 sm:p-8">
            <MarkdownContent markdown={markdownBody} />
          </CardContent>
        </Card>

        {neighbors.previous || neighbors.next ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {neighbors.previous ? (
              <a
                className="block"
                href={docHref(routePath, neighbors.previous.doc.routePath)}
              >
                <Card className="site-panel h-full rounded-3xl border-border/70 bg-card/96 transition-colors hover:border-foreground/12">
                  <CardHeader className="space-y-2">
                    <CardDescription>Previous</CardDescription>
                    <CardTitle className="text-lg">
                      {neighbors.previous.doc.title}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </a>
            ) : (
              <div />
            )}
            {neighbors.next ? (
              <a
                className="block"
                href={docHref(routePath, neighbors.next.doc.routePath)}
              >
                <Card className="site-panel h-full rounded-3xl border-border/70 bg-card/96 text-right transition-colors hover:border-foreground/12">
                  <CardHeader className="space-y-2">
                    <CardDescription>Next</CardDescription>
                    <CardTitle className="text-lg">
                      {neighbors.next.doc.title}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </a>
            ) : null}
          </div>
        ) : null}
      </article>

      <aside className="hidden xl:block">
        <Card className="site-panel sticky top-28 rounded-[28px] border-border/70 bg-card/96">
          <CardHeader className="space-y-2">
            <CardTitle className="text-sm">On this page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {headings.length > 0 ? (
              headings.map((heading) => (
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
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                This page is intentionally short.
              </p>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

export function DocsPageRoot({
  data,
  currentRoute,
}: {
  data: SiteData;
  currentRoute: string | null;
}) {
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);
  const filteredSections = filterSections(data, deferredQuery);
  const filteredData = { sections: filteredSections };
  const currentDoc = findDocForRoute(data, currentRoute);

  React.useEffect(() => {
    setQuery("");
  }, [currentRoute]);

  return (
    <div className="site-root docs-site-root">
      <DocsTopbar
        currentRoute={currentRoute}
        currentTitle={currentDoc?.title ?? null}
        onQueryChange={setQuery}
        query={query}
      />
      <div className="site-shell docs-shell">
        <aside className="docs-shell__sidebar-column">
          <div className="docs-shell__sidebar">
            <SidebarProvider className="docs-sidebar-provider" defaultOpen>
              <DocsSidebarNav
                currentRoute={currentRoute}
                data={filteredData}
                onQueryChange={setQuery}
                query={query}
              />
            </SidebarProvider>
          </div>
        </aside>
        <main className="docs-main">
          <div className="docs-main__inner">
            {currentRoute && currentRoute !== "home" ? (
              <DocsPage data={data} routePath={currentRoute} />
            ) : (
              <DocsHome
                currentRoute={currentRoute}
                data={filteredData}
                query={deferredQuery}
              />
            )}
          </div>
        </main>
      </div>
      <SiteFooter
        docsHref={docsHomeHref(currentRoute)}
        installHref={docHref(currentRoute, "install-guide")}
      />
    </div>
  );
}

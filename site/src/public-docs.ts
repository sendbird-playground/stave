export type PublicDocRoute = {
  routePath: string
  sourcePath: string
  previewImage?: string
  featured?: boolean
}

export type PublicDocSection = {
  id: string
  title: string
  description: string
  docs: PublicDocRoute[]
}

export const PUBLIC_DOC_SECTIONS: PublicDocSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "Install Stave, get the main controls working, and learn the shortest path to a productive workspace.",
    docs: [
      {
        routePath: "install-guide",
        sourcePath: "docs/install-guide.md",
        previewImage: "screenshots/stave-app.png",
        featured: true,
      },
      {
        routePath: "command-palette",
        sourcePath: "docs/features/command-palette.md",
        previewImage: "screenshots/command-palette.png",
        featured: true,
      },
      {
        routePath: "integrated-terminal",
        sourcePath: "docs/features/integrated-terminal.md",
        previewImage: "screenshots/integrated-terminal.png",
        featured: true,
      },
      {
        routePath: "project-instructions",
        sourcePath: "docs/features/project-instructions.md",
        previewImage: "screenshots/project-instructions.png",
        featured: true,
      },
    ],
  },
  {
    id: "daily-work",
    title: "Daily Work",
    description: "The guides people are most likely to reach for while using Stave day to day.",
    docs: [
      {
        routePath: "attachments",
        sourcePath: "docs/features/attachments.md",
      },
      {
        routePath: "notifications",
        sourcePath: "docs/features/notifications.md",
        previewImage: "screenshots/notifications.png",
      },
      {
        routePath: "workspace-latest-turn-summary",
        sourcePath: "docs/features/workspace-latest-turn-summary.md",
        previewImage: "screenshots/information-panel.png",
      },
      {
        routePath: "workspace-scripts",
        sourcePath: "docs/features/workspace-scripts.md",
        previewImage: "screenshots/scripts-panel.png",
      },
      {
        routePath: "zen-mode",
        sourcePath: "docs/features/zen-mode.md",
        previewImage: "screenshots/workspace-mode.png",
      },
    ],
  },
  {
    id: "automation-and-controls",
    title: "Automation And Controls",
    description: "Provider setup, automation entry points, and the controls that affect how Stave works with Claude and Codex.",
    docs: [
      {
        routePath: "provider-sandbox-and-approval",
        sourcePath: "docs/features/provider-sandbox-and-approval.md",
        previewImage: "screenshots/provider-controls-claude.png",
      },
      {
        routePath: "local-mcp-user-guide",
        sourcePath: "docs/features/local-mcp-user-guide.md",
        previewImage: "screenshots/mcp-settings.png",
      },
      {
        routePath: "skill-selector",
        sourcePath: "docs/features/skill-selector.md",
        previewImage: "screenshots/skills-panel.png",
      },
      {
        routePath: "stave-muse",
        sourcePath: "docs/features/stave-muse.md",
      },
    ],
  },
  {
    id: "reference",
    title: "Reference",
    description: "Focused reference material for specific surfaces, platform behavior, and advanced workspace tools.",
    docs: [
      {
        routePath: "language-intelligence",
        sourcePath: "docs/features/language-intelligence.md",
        previewImage: "screenshots/language-intelligence.png",
      },
      {
        routePath: "lens",
        sourcePath: "docs/features/lens.md",
      },
      {
        routePath: "macos-folder-access-prompts",
        sourcePath: "docs/features/macos-folder-access-prompts.md",
      },
    ],
  },
]

export function flattenPublicDocs() {
  return PUBLIC_DOC_SECTIONS.flatMap((section) => section.docs)
}

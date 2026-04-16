export type PublicDocRoute = {
  routePath: string;
  sourcePath: string;
  title?: string;
  description?: string;
  previewImage?: string;
  featured?: boolean;
};

export type PublicDocSection = {
  id: string;
  title: string;
  description: string;
  docs: PublicDocRoute[];
};

export const PUBLIC_DOC_SECTIONS: PublicDocSection[] = [
  {
    id: "get-started",
    title: "Get Started",
    description:
      "Install the app, learn the main workspace surfaces, and choose safe defaults for your first turns.",
    docs: [
      {
        routePath: "install-guide",
        sourcePath: "docs/install-guide.md",
        title: "Install on macOS",
        description:
          "Install the latest Stave desktop build with GitHub CLI and launch straight into the workspace.",
        previewImage: "screenshots/stave-app.png",
        featured: true,
      },
      {
        routePath: "integrated-terminal",
        sourcePath: "docs/features/integrated-terminal.md",
        title: "Integrated Terminal",
        description:
          "Use docked shells and full-panel Claude or Codex sessions without leaving the workspace.",
        previewImage: "screenshots/integrated-terminal.png",
        featured: true,
      },
      {
        routePath: "command-palette",
        sourcePath: "docs/features/command-palette.md",
        title: "Command Palette",
        description:
          "Jump to actions, navigation, and workspace controls from one searchable launcher.",
        previewImage: "screenshots/command-palette.png",
        featured: true,
      },
      {
        routePath: "provider-sandbox-and-approval",
        sourcePath: "docs/features/provider-sandbox-and-approval.md",
        title: "Runtime Safety Controls",
        description:
          "Choose file access, approvals, network access, and plan mode before you send a turn.",
        previewImage: "screenshots/provider-controls-claude.png",
        featured: true,
      },
    ],
  },
  {
    id: "core-features",
    title: "Core Features",
    description:
      "The product surfaces most people use every day while working inside Stave.",
    docs: [
      {
        routePath: "project-instructions",
        sourcePath: "docs/features/project-instructions.md",
        title: "Project Instructions",
        description:
          "Save repository-specific rules once so every task in that project starts with the same guidance.",
        previewImage: "screenshots/project-instructions.png",
        featured: true,
      },
      {
        routePath: "attachments",
        sourcePath: "docs/features/attachments.md",
        title: "Attachments",
        description:
          "Add files and context to a task when the model should work from exact local material.",
      },
      {
        routePath: "notifications",
        sourcePath: "docs/features/notifications.md",
        title: "Notifications",
        description:
          "Track approvals, task status, and follow-up work without staying inside one task view.",
        previewImage: "screenshots/notifications.png",
      },
      {
        routePath: "workspace-latest-turn-summary",
        sourcePath: "docs/features/workspace-latest-turn-summary.md",
        title: "Latest Turn Summary",
        description:
          "Keep a short workspace recap visible in the Information panel so switching context is faster.",
        previewImage: "screenshots/information-panel.png",
      },
      {
        routePath: "workspace-scripts",
        sourcePath: "docs/features/workspace-scripts.md",
        title: "Workspace Scripts",
        description:
          "Run shared actions, services, and lifecycle hooks from the workspace instead of memorizing commands.",
        previewImage: "screenshots/scripts-panel.png",
      },
      {
        routePath: "zen-mode",
        sourcePath: "docs/features/zen-mode.md",
        title: "Zen Mode",
        description:
          "Hide surrounding chrome when you want the workspace to focus on the active task only.",
        previewImage: "screenshots/workspace-mode.png",
      },
    ],
  },
  {
    id: "guides",
    title: "Guides",
    description:
      "Product-facing setup and automation guides for people who want to go deeper than the default workflow.",
    docs: [
      {
        routePath: "local-mcp-user-guide",
        sourcePath: "docs/features/local-mcp-user-guide.md",
        title: "Local MCP",
        description:
          "Expose Stave tools to same-machine automation clients without turning the app into a remote service.",
        previewImage: "screenshots/mcp-settings.png",
      },
      {
        routePath: "lens",
        sourcePath: "docs/features/lens.md",
        title: "Lens Browser",
        description:
          "Inspect a live page inside the desktop app and send element context directly into a task.",
      },
    ],
  },
  {
    id: "reference",
    title: "Reference",
    description:
      "Focused reference material for platform behavior, editor support, and troubleshooting edge cases.",
    docs: [
      {
        routePath: "language-intelligence",
        sourcePath: "docs/features/language-intelligence.md",
        title: "Language Intelligence",
        description:
          "Understand how Stave uses language servers and project context for editor-aware features.",
        previewImage: "screenshots/language-intelligence.png",
      },
      {
        routePath: "macos-folder-access-prompts",
        sourcePath: "docs/features/macos-folder-access-prompts.md",
        title: "macOS Folder Access Prompts",
        description:
          "Handle the repeated system permission dialogs that can appear after install or update.",
      },
    ],
  },
];

export function flattenPublicDocs() {
  return PUBLIC_DOC_SECTIONS.flatMap((section) => section.docs);
}

# Stave Documentation

This folder is the stable documentation root for Stave.

Use `docs/` for architecture, feature behavior, runtime contracts, and user-facing technical reference.

## Getting Started

- [README](../README.md)
- [Install Guide](install-guide.md)
- [Developer and Contributing Guide](developer/contributing.md)

## Feature Guides

- [Provider sandbox and approval guide](features/provider-sandbox-and-approval.md)
- [Project Instructions](features/project-instructions.md)
- [Lens](features/lens.md)
- [Local MCP user guide](features/local-mcp-user-guide.md)
- [Workspace latest turn summary](features/workspace-latest-turn-summary.md)
- [Stave Muse](features/stave-muse.md)
- [Stave Model Router](features/stave-model-router.md)
- [Workspace PR Status](features/workspace-pr-status.md)
- [Workspace Scripts](features/workspace-scripts.md)
- [Notifications](features/notifications.md)
- [Command Palette](features/command-palette.md)
- [Integrated Terminal](features/integrated-terminal.md)
- [macOS Folder Access Prompts](features/macos-folder-access-prompts.md)
- [Zen Mode](features/zen-mode.md)
- [Skill selector](features/skill-selector.md)
- [Attachments](features/attachments.md)
- [Language intelligence](features/language-intelligence.md)

## Architecture And Contracts

- [Architecture](architecture/runtime.md)
- [Architecture map](architecture/index.md)
- [Conversation flow](architecture/conversation-flow.md)
- [Entrypoints](architecture/entrypoints.md)
- [Contracts](architecture/contracts.md)
- [Workspace integrity](architecture/workspace-integrity.md)
- [Repo map spec](architecture/repo-map-spec.md)
- [Chat message rendering](architecture/chat-message-rendering.md)
- [Provider runtimes](providers/provider-runtimes.md)

## Developer Reference

- [Developer diagnostics](developer/diagnostics.md)
- [Provider session stability](developer/provider-session-stability.md)
- [Terminal regression prevention](developer/terminal-regression-prevention.md)
- [Zustand selector stability](developer/zustand-selector-stability.md)
- [VS Code inline completion analysis](developer/vscode-inline-completion-analysis.md)
- [CLI session architecture review](developer/cli-session-architecture-review.md)

## Design And UI Notes

- [shadcn preset](ui/shadcn-preset.md)
- [Project / workspace / task shell redesign](ui/project-workspace-task-shell.md)
- [GitHub Pages landing page](ui/github-landing-page.md)

## Documentation Authoring

- [Feature guide authoring](features/README.md)
- [Feature guide template](templates/feature-guide-template.md)

## Planning And Historical Notes

These documents are useful for historical context and planning, but some of them describe proposals, rollout plans, or older runtime paths rather than current behavior.

- [Embedded Local MCP Plan](architecture/local-mcp-embedded-plan.md)
- [Future SDK backlog](future/claude-sdk-candidates.md)
- [Codex native plan roadmap (historical, 2026-03-31)](future/codex-native-plan-mode-roadmap-2026-03-31.md)
- [Checkpoint restore roadmap (2026-03-29)](future/checkpoint-restore-roadmap-2026-03-29.md)
- [Agent exploration harness plan (2026-03-29)](future/agent-exploration-harness-plan-2026-03-29.md)
- [Local data roadmap (2026-03-29)](future/local-data-roadmap-2026-03-29.md)
- [Remote Stave control roadmap (2026-03-31)](future/remote-stave-control-roadmap-2026-03-31.md)
- [Shared skill management plan (2026-03-13)](future/shared-skill-management-plan-2026-03-13.md)
- [Cross-provider context sharing plan (2026-04-12)](future/cross-provider-context-sharing-plan-2026-04-12.md)
- [Workspace fork plan (2026-04-05)](future/stave-workspace-fork-plan-2026-04-05.md)

## Conventions

- keep `README.md` focused on overview plus common install and setup paths
- put durable technical detail in `docs/`

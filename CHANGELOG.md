# Changelog

## [0.0.6](https://github.com/astyfx/stave/compare/v0.0.5...v0.0.6) (2026-03-10)

- reworked provider turn execution around canonical conversation requests, runtime-side request translators, and persisted per-turn request snapshots so Claude and Codex can share one task chat model more reliably
- fixed provider concurrency by scoping abort, approval, and user-input responders to individual turn ids instead of a single active slot per provider
- centralized provider model metadata, availability, native command handling, and session labeling to reduce hardcoded Claude/Codex branching and make later provider additions cheaper
- kept Claude's dedicated plan viewer but removed the Stave-managed Codex plan parser and plan mode so Codex now streams plain responses directly into the shared chat surface
- expanded the latest-turn diagnostics UI with provider session ids, persisted event timelines, and request snapshot inspection, and added surrounding shell polish such as the keyboard shortcuts drawer

## 0.0.5 - 2026-03-10

- fixed chat markdown tables so GFM pipe-table syntax renders as actual table markup instead of plain text in assistant messages
- moved message markdown rendering into a dedicated renderer with `remark-gfm` support and regression coverage for table output
- switched markdown tables onto the shared shadcn table primitives and forced long cell content to wrap within the message bubble instead of causing horizontal overflow

## 0.0.4 - 2026-03-10

- fixed Claude workspace path anchoring so relative paths like `./docs` stay rooted in the active Stave workspace instead of drifting to guessed sibling directories
- hardened Claude tool approval and user-input permission responses to always return SDK-safe payloads, preventing the recurring `updatedInput`/`message` Zod failure seen in archived sessions
- added regression coverage for Claude approval payloads, user-input payloads, and workspace-root system prompt composition

## 0.0.3 - 2026-03-09

- simplified branding to plain `Stave`, including the window title, app title, and persisted app store key
- refined chat UI with grouped file review blocks, tool/header polish, larger message typography, task timestamp display, and tooltip cleanup
- improved workspace and project menus by moving them onto the shared dropdown primitives and adding session-id access from the task menu
- tightened settings and task list UX with reduced rerender pressure, cleaner workspace identity styling, and updated menu surfaces

## 0.0.2 - 2026-03-09

- added persisted provider runtime settings and bridge updates for Codex and Claude execution controls
- improved chat message rendering with grouped changed-files and referenced-files blocks, better diff restore behavior, and highlighted file previews
- refined editor and workspace shell UX with clearer diff handling, shared workspace identity accents, and unified tooltip usage
- rebuilt the settings dialog into section-based panels with narrower rerenders and preset-aligned inverted dropdown and tooltip surfaces

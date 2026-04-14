# Agent Exploration Harness Plan (2026-03-29)

Status: phase 1 implemented on 2026-03-29. This document now serves as the rollout record plus follow-up backlog.

## Goal

Reduce the cost of the initial "understand the workspace and related code" step for Claude, Codex, and Stave.

## What This Change Adds

- Codex hook harness in `.codex/hooks.json`
- session-start context injection script
- prompt-submit guidance script
- architecture navigation docs:
  - `docs/architecture/index.md`
  - `docs/architecture/entrypoints.md`
  - `docs/architecture/contracts.md`
  - `docs/architecture/repo-map-spec.md`
- repo-local exploration skills:
  - `skills/the-explore-codebase`
  - `skills/the-trace-execution-path`
  - `skills/the-ipc-contract-audit`

## Operating Model

### Always-loaded layer

Keep this layer thin:

- `AGENTS.md`
- `CLAUDE.md`
- `.codex/hooks.json`
- `docs/architecture/index.md`

This layer should only route the agent toward the right deeper material.

### On-demand layer

Load only when relevant:

- `docs/architecture/entrypoints.md`
- `docs/architecture/contracts.md`
- repo-local skills
- repo-map output

### Generated layer

Do not hand-maintain:

- `<git-dir>/stave-cache/repo-map.json`
- `<git-dir>/stave-cache/repo-map.md`
- fallback: `.stave/cache/repo-map.json`
- fallback: `.stave/cache/repo-map.md`

## Why This Split

- big root instruction files degrade adherence and waste context
- repo-local skills are better for repeatable exploration workflows
- hooks are good for deterministic preflight and prompt classification
- repo-map work should be generated because it will drift if edited manually

## Next Steps

### Phase 1

- validate the hooks in live Codex sessions
- dogfood the new skills from Stave's `$` selector
- expand architecture docs only when a repeated exploration question appears
- repo-map generation is implemented and cached
- TopBar now pre-warms repo-map context for the active workspace via async `getRepoMap` IPC into an in-memory `Map` cache
- the first task turn injects the repo-map summary as retrieved context via synchronous `Map.get` (no IPC, no blocking)

### Phase 2

- add symbol and dependency search to the quick-open path
- add contract groups and symbol summaries to the generated repo-map
- surface repo-map freshness and summaries in a future task-history or diagnostics surface

### Phase 3

- add provider-aware subagents for architecture, IPC, and runtime tracing
- optionally add Claude path-specific `.claude/rules/` or project agents once usage patterns settle

## Success Criteria

- fewer broad "read the whole repo" exploration turns
- faster identification of first files to inspect
- fewer missed multi-file contract updates
- repeatable entrypoint discovery across Claude, Codex, and Stave

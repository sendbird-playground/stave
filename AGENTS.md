# AGENTS.md

## Purpose 

Project policy entrypoint for `/home/astyfx/stave`.

## Local Override (IMPORTANT)

`AGENTS.local.md` is a project-local overlay convention for this repository. It is not an official `agents.md` standard feature.

## Base Policy

If no local overlay exists, load and prioritize user's `AGENTS.md` as the primary policy source.

## Release Workflow

Use `$stave-patch-release` only for explicit Stave release requests. This includes requests to ship or publish a release, bump the app version, generate release notes or changelog entries for a release, create or move a semver release tag, or repair an already-created release.

Both Codex and Claude should treat the literal token `$stave-patch-release` as an explicit release trigger.

- Use `$stave-patch-release`.
- Generate or refresh `CHANGELOG.md` with `bunx --bun conventional-changelog-cli -p conventionalcommits -i CHANGELOG.md -s` instead of hand-writing release sections.
- Keep release tags in `vX.Y.Z` form. Incremental `conventional-changelog` generation depends on semver tags.
- If the repo has no prior semver release tag, stop and report that the release flow needs a baseline tag before incremental changelog generation is safe.
- Push the release commit and matching release tag to both `origin` and `public`.

Do not use `$stave-patch-release` for ordinary `commit`, `push`, or `commit and push` requests unless the user also explicitly asks to release.

For ordinary commit/push requests:

- use normal git commit/push flow
- do not bump `package.json`
- do not update `CHANGELOG.md` unless the user explicitly asks for it
- do not create, move, or delete semver release tags unless the user explicitly asks for release repair

## UI Components

When using an existing shadcn component, prefer generating it with `bunx --bun shadcn@latest add <component>` instead of hand-writing or directly vendoring the wrapper first.

After generating shadcn components or copying UI code from external sources, verify that import paths match this project's configured aliases before finishing. In this repo, `tsconfig.json` resolves `@/*` to `src/*`, so generated `src/...` imports should be rewritten to `@/...`. More generally, do not assume copied code uses this repo's path layout; reconcile imports with the current `tsconfig` and `components.json` settings.

## Quick Reference

- Runtime: **Bun**
- Test: `bun test`
- Build (web): `bun run build`
- Build (desktop): `bun run build:desktop`
- Dev (web): `bun run dev`
- Dev (desktop): `bun run dev:desktop`
- E2E: `bun run test:e2e`
- CI gate: `bun run test:ci` (typecheck → test → build → build:desktop)
- Always use `bunx --bun` instead of `npx`.

## Architecture

```
Electron main process  →  electron/
  ├── providers/       →  Claude & Codex SDK runtime adapters
  ├── persistence/     →  SQLite via better-sqlite3
  ├── main/ipc/        →  IPC handlers (preload bridge)
  └── main/lsp/        →  Language Server Protocol

React renderer         →  src/
  ├── store/           →  Zustand (app.store.ts is the central store, ~2 100 lines)
  ├── components/      →  UI (shadcn in ui/, domain in session/, ai-elements/)
  ├── lib/providers/   →  Renderer-side provider abstraction
  ├── lib/db/          →  Renderer-side DB access via IPC
  └── types/           →  Shared type definitions (window-api.d.ts defines the IPC contract)
```

### Key files

| File | Role |
|------|------|
| `src/store/app.store.ts` | Central Zustand store (~2 100 lines). Read targeted slices, not the whole file. |
| `electron/providers/claude-sdk-runtime.ts` | Claude SDK adapter (~1 200 lines) |
| `electron/providers/codex-sdk-runtime.ts` | Codex SDK adapter (~800 lines) |
| `src/types/window-api.d.ts` | IPC contract between renderer and main process |
| `electron/preload.ts` | Electron preload — exposes `window.api` |

### Boundaries

- **Renderer** code must never import Node-only modules directly. All Node access goes through the IPC bridge defined in `window-api.d.ts`.
- **Provider runtimes** live in `electron/providers/`. When modifying one adapter, check the other for symmetry.

## Code Conventions

- **Import paths:** always use `@/...` alias, never bare `../../` from `src/`.
- **State:** Zustand slices in `src/store/`. Avoid prop-drilling.
- **IPC:** typed via `src/types/window-api.d.ts`. Keep renderer and main process types in sync.
- **Tests:** colocate in `tests/*.test.ts`. Use Bun test runner (`bun test`).
- **Formatting:** no ESLint or Prettier. Rely on TypeScript strict mode + `.editorconfig` (UTF-8, 2-space indent, LF).
- **Commit style:** conventional commits (`feat:`, `fix:`, `refactor:`, etc.).

## Documentation Maintenance

When behavior, architecture, UX, settings, or release-facing details change, review `README.md` and the relevant files under `docs/` before finishing.

If a code change or commit would leave `README.md` or `docs/` stale, update the documentation in the same piece of work.

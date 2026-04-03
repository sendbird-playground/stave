# AGENTS.md

## Purpose 

Project policy entrypoint for this repository root, regardless of the local checkout path.

## Local Override (MUST)

`AGENTS.local.md` is a project-local overlay convention for this repository. It is not an official `agents.md` standard feature.

## Base Policy

If no local overlay exists, load and prioritize user's `AGENTS.md` as the primary policy source.

## PR Workflow

Use `$stave-worktree-pr-flow` for any request that asks to create a pull request from current in-progress work.
This includes prompts like "PR 만들어", "create a PR", "push and open a PR", "commit and PR", "worktree로 PR 올려줘", or any variation that ends in creating a GitHub PR.

Both Codex and Claude should treat the literal token `$stave-worktree-pr-flow` as an explicit PR-flow trigger.
The repository-local copy of this skill lives at `skills/stave-worktree-pr-flow/SKILL.md`.

- Use `$stave-worktree-pr-flow`.
- The PR title **must** follow Conventional Commits format (`type(scope): description`) and match the commit message type and scope. Do not use plain natural-language titles.
- The subject of the title must be lowercase (not capitalised).

Do not use `$stave-worktree-pr-flow` for plain `commit` or `push` requests that do not mention a PR.

## Release Workflow

Use `$stave-release` only for explicit Stave release requests. This includes requests to ship or publish a release, bump the app version, generate release notes or changelog entries for a release, or prepare a versioned release PR against `main`.

Both Codex and Claude should treat the literal token `$stave-release` as an explicit release trigger.
The repository-local copy of this skill lives at `skills/stave-release/SKILL.md`.

- Use `$stave-release`.
- Generate or refresh `CHANGELOG.md` with `bunx --bun conventional-changelog-cli -p conventionalcommits -i CHANGELOG.md -s` instead of hand-writing release sections.
- Review the actual PR changes in the release scope when preparing release notes or the release PR summary. Do not rely on commit titles alone.
- Keep release tags in `vX.Y.Z` form. Incremental `conventional-changelog` generation depends on semver tags.
- If the repo has no prior semver release tag, stop and report that the release flow needs a baseline tag before incremental changelog generation is safe.
- Use the repository release skill flow to create a release branch, open a PR against `main`, and keep the original checkout clean.

Do not use `$stave-release` for ordinary `commit`, `push`, or `commit and push` requests unless the user also explicitly asks to release.

For ordinary commit/push requests:

- use normal git commit/push flow
- do not bump `package.json`
- do not update `CHANGELOG.md` unless the user explicitly asks for it
- do not create, move, or delete semver release tags unless the user explicitly asks for release repair

## UI Components

When using an existing shadcn component, prefer generating it with `bunx --bun shadcn@latest add <component>` instead of hand-writing or directly vendoring the wrapper first.

After generating shadcn components or copying UI code from external sources, verify that import paths match this project's configured aliases before finishing. In this repo, `tsconfig.json` resolves `@/*` to `src/*`, so generated `src/...` imports should be rewritten to `@/...`. More generally, do not assume copied code uses this repo's path layout; reconcile imports with the current `tsconfig` and `components.json` settings.

When applying or reapplying a shadcn preset, do not stop at `shadcn init`. Update the preset reference in user-facing copy and documentation in the same piece of work, and review the related files that encode the preset shape in this repo: `components.json`, `src/globals.css`, `src/components/layout/settings-dialog-sections.tsx`, and `docs/ui/shadcn-preset.md`.

## Design Workflow

Use `$stave-design-system` for any request that changes Stave UI, layout, theme, component styling, dialogs, sidebars, empty states, prompt input, or other visual UX.

Both Codex and Claude should treat the literal token `$stave-design-system` as the default design-system trigger for Stave frontend work.
The repository-local copy of this skill lives at `skills/stave-design-system/SKILL.md`.

- Use `$stave-design-system`.
- Start from the existing token and shadcn architecture instead of importing a generic external design language wholesale.
- Treat glassmorphism as a restrained accent that supports depth, not as the default treatment for every surface.
- Keep desktop density, accessibility, and light/dark consistency ahead of visual novelty.
- If a UI change alters shared design-system behavior or preset-facing copy, update the related docs in the same change.
- **All UI work must verify the theme system.** See the "Theme System" section below — it applies to every layout, component, colour, and surface change, not just theme-specific files.

## Theme System (mandatory for ALL UI work)

**Every change that touches Stave's UI — layout, components, colours, shadcn presets, new surfaces, dialogs, sidebar, editor, terminal, or any visual element — must verify and, if needed, update the theme system.**

This is not limited to "theme files only". If you add a new component that introduces a colour token, restructure a layout that relies on existing tokens, swap a shadcn preset, or change how any surface looks in light/dark mode, the theme system is part of that change.

All UI colour is driven by CSS custom properties in `src/globals.css` and the theme module at `src/lib/themes/`. Both the base light/dark system **and** the custom theme system (built-in presets + user-installable themes) consume the same token set. A token added to one layer but missing from the other is a visual regression.

### Required check files

| File | Role |
|------|------|
| `src/globals.css` | Base `:root` and `.dark` CSS variable declarations + `@theme inline` Tailwind mapping |
| `src/lib/themes/types.ts` | `THEME_TOKEN_NAMES` array and `ThemeTokenName` type (core tokens) |
| `src/lib/themes/presets.ts` | `PRESET_THEME_TOKENS` — default values for light and dark base modes |
| `src/lib/themes/builtin-themes.ts` | Built-in custom theme definitions (e.g. Dark High Contrast) |
| `src/lib/themes/apply.ts` | DOM application logic (`applyCustomTheme`, `applyThemeOverrides`, etc.) |
| `src/lib/themes/validate.ts` | Zod schema for user-installable theme JSON |
| `src/lib/themes/index.ts` | Public API re-exports |
| `src/store/theme.utils.ts` | Thin re-export layer (keeps `@/store/theme.utils` import path working) |
| `tests/custom-theme.test.ts` | Theme validation and integrity tests |

### When to apply these rules

These rules apply when **any** of the following is true:

- A CSS custom property (`--*`) is added, removed, renamed, or its value changed in `globals.css`.
- A component or layout introduces a new semantic colour that does not already have a CSS variable.
- A shadcn preset is applied or changed (presets rewrite `globals.css` token values).
- A new UI surface is added (panel, dialog, tab, sidebar section, etc.) that uses its own colour tokens.
- Base light or dark mode colours are adjusted for any reason.
- The Tailwind `@theme inline` block is modified.
- The settings Design section or theme application logic is modified.

### Rules

- **Adding or renaming a CSS custom property in `globals.css`:**
  1. If the property is a core UI token (used by shadcn or layout), add it to `THEME_TOKEN_NAMES` in `types.ts` and provide default values in `presets.ts` for both light and dark modes.
  2. Update **every** built-in custom theme in `builtin-themes.ts` to include a value for the new token. A built-in theme that omits a token the base theme defines will fall through to the base value, which may break the theme's visual intent.
  3. If the property is an extended token (editor, terminal, diff, chart, provider, etc.), it does not need to be in `THEME_TOKEN_NAMES` but **must** still be added to every built-in theme in `builtin-themes.ts` and to the `@theme inline` block in `globals.css`.
  4. Update the Tailwind `@theme inline` block in `globals.css` so Tailwind utility classes resolve the new variable.

- **Removing or renaming a CSS custom property:**
  1. Remove / rename in `globals.css`, `types.ts`, `presets.ts`, `builtin-themes.ts`, and the `@theme inline` block.
  2. Search for usages across all component files (`src/components/`) and Tailwind classes (`bg-<token>`, `text-<token>`, `border-<token>`, etc.).

- **Modifying base light/dark colour values:**
  1. Keep `globals.css` declarations and `PRESET_THEME_TOKENS` in `presets.ts` in sync. They must always hold identical values.
  2. Evaluate whether each built-in custom theme still looks correct against the new base palette. If not, update the theme's `tokens` map.

- **Adding a new UI surface or component with its own colour tokens:**
  1. Define the CSS variable in both `:root` and `.dark` blocks in `globals.css`.
  2. Add the variable to the `@theme inline` block if it should be available as a Tailwind utility.
  3. Add the token value to every built-in custom theme in `builtin-themes.ts`.

- **Applying or changing a shadcn preset:**
  1. After `shadcn init`, compare the regenerated token values in `globals.css` with `presets.ts` and reconcile.
  2. Re-evaluate every built-in custom theme against the new base palette.

- **Adding a new built-in custom theme:**
  1. Define it as a `CustomThemeDefinition` object in `builtin-themes.ts` and add it to the `BUILTIN_CUSTOM_THEMES` array.
  2. It must include values for **all** core tokens (the 27 in `THEME_TOKEN_NAMES`) plus every extended token used in `globals.css`.
  3. Add a test case in `tests/custom-theme.test.ts` to verify the new theme's integrity.

- **Changing the settings UI (Design section) or theme application logic:**
  1. Verify that `applyCustomTheme` → `applyThemeOverrides` → `applyFontOverrides` cascade order is preserved (custom theme < user overrides).
  2. Verify that `installCustomTheme` / `removeCustomTheme` store actions still pass `userThemes` to `findCustomThemeById`.

- **Do not treat any UI or design change as complete** until you have explicitly checked every file in the table above for required updates. TypeScript passing is not sufficient — a missing token in a built-in theme is a silent visual regression, not a type error.

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

### Provider Schema Guardrails

- Treat `runtimeOptions` and all provider IPC payloads as **multi-file contracts**, not local types.
- `electron/main/ipc/schemas.ts` is a **required check file** for any work touching provider turns, chat message parts, Stave Auto, provider events, replay payloads, preload/window API contracts, or settings that flow into a turn request.
- Do not treat a change as complete until you have explicitly checked whether `electron/main/ipc/schemas.ts` needs a matching update. TypeScript passing elsewhere is not sufficient.
- When adding, renaming, or deleting any provider runtime option or IPC field, update the same change across:
  - `electron/providers/types.ts`
  - `src/lib/providers/provider.types.ts`
  - `electron/preload.ts`
  - `src/types/window-api.d.ts`
  - `electron/main/ipc/schemas.ts`
  - any producer/consumer call sites such as `src/store/app.store.ts` and session/input UI
- Apply the same rule to:
  - `MessagePart` / canonical conversation payload shape changes
  - provider event payload changes
  - Stave Auto / router / orchestration settings or request payload changes
  - anything under `src/store/app.store.ts`, `src/types/chat.ts`, `src/lib/session/provider-event-replay.ts`, `electron/providers/`, or `electron/main/ipc/provider.ts` that affects provider request or response shapes
- `electron/main/ipc/schemas.ts` uses strict Zod schemas. A new field that is not added there can break both providers at runtime even when TypeScript still passes elsewhere.
- Assume strict IPC rejection first when chat turns suddenly stop working after a schema-ish change. Check `runtimeOptions`, canonical conversation parts, and discriminated unions in `electron/main/ipc/schemas.ts` before debugging deeper runtime logic.
- Do not ship a new runtime option unless the end-to-end path has been checked from renderer call site → preload contract → IPC schema → main/provider runtime.
- For any related change, verify the full path explicitly:
  renderer producer → shared TS type → preload/window API → `electron/main/ipc/schemas.ts` strict Zod schema → main IPC handler → provider runtime/replay consumer.
- After touching provider option schemas or IPC contracts, run `bun run typecheck` before finishing. If provider runtime code changed, also do a smoke check that both Claude and Codex can still start a turn or load their runtime entry path.
- When upgrading `@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`, or the Codex/Claude CLI expectations, verify new option names and object shapes against the installed package types/docs in `node_modules` before wiring them into Stave. Do not assume flag names from memory.
- If a change is intentionally provider-specific, note that explicitly in code or the final handoff. Otherwise, review the sibling provider adapter for symmetry.

### NormalizedProviderEvent ↔ Zod Schema Sync

`NormalizedProviderEvent` (TypeScript union in `src/lib/providers/provider.types.ts`) and `NormalizedProviderEventSchema` (Zod discriminated union in `src/lib/providers/schemas.ts`) **must always be kept in sync**.

**Why this matters:**
All IPC events emitted from `electron/providers/` travel through `adapter.factory.ts → parseNormalizedEvent()`, which validates every event against `NormalizedProviderEventSchema`. Any event type missing from the Zod schema is silently dropped — TypeScript will not catch this because the TS type and Zod schema are separate definitions.

**Rules:**
- Every time you add a new event variant to `NormalizedProviderEvent`, immediately add the matching Zod schema object to `NormalizedProviderEventSchema` in the same commit/change.
- Every time you rename an event type string (e.g. `"stave:execution_plan"` → `"stave:execution_processing"`), rename **both** the TypeScript union literal and the Zod `z.literal(...)` in the same change. Also update every `electron/providers/` emitter and `src/lib/session/provider-event-replay.ts` handler.
- The Zod schema variable names (e.g. `StaveExecutionProcessingEventSchema`) must mirror the TypeScript type for easy auditing. If they diverge, treat it as a bug.
- After any change to either file, verify with `bun run typecheck`. TypeScript type errors may not surface missing Zod entries — manually cross-check that every member of the `NormalizedProviderEvent` union has a corresponding Zod schema in `NormalizedProviderEventSchema`.

## React 19 + Zustand Selector Stability

**Treat unstable Zustand selector outputs as a runtime correctness bug, not a micro-optimization.** In this repo, React 19 + Zustand 5 can enter `Maximum update depth exceeded` loops when a selector returns a fresh snapshot every render.

This applies to `useAppStore(...)`, `useStore(...)`, and any equivalent hook built on `useSyncExternalStore`.

### Rules

- Do **not** return a freshly allocated object, array, `Map`, `Set`, or function from a plain store selector.
- If you need multiple store values, prefer `useShallow((state) => [a, b, c] as const)` or separate primitive selectors.
- Do **not** do `.map()`, `.filter()`, `.slice()`, object spread, or inline object assembly inside a selector unless the selector is wrapped in `useShallow` **and** every returned item is itself reference-stable.
- Do **not** use inline fallback allocations such as `?? []`, `?? {}`, or `|| []` inside selectors. Use module-level constants like `EMPTY_MESSAGES` instead.
- When a component needs a derived object like `{ messageId, part }`, select stable primitives / existing references first, then assemble the derived object with `useMemo` outside the store hook.
- Derive presentation arrays (`visibleMessages`, filtered tasks, grouped items, etc.) after the selector using `useMemo`, not inside the selector.
- A selector that returns an existing object from store state or a primitive is usually safe. A selector that creates a new container is suspicious by default.

### Required verification

- Any change to hot renderer surfaces using Zustand subscriptions must check for selector stability before the work is considered complete.
- High-risk surfaces include `ChatInput`, `PlanViewer`, `ChatPanel`, `ProjectWorkspaceSidebar`, `WorkspaceTaskTabs`, and task/workspace switch flows.
- After changing selector logic on those surfaces, run `bun run typecheck` and the most relevant `bun test` targets.
- If the change affects task switching, workspace switching, plan mode, replay drawers, or streaming UI, do a manual smoke check for those flows as well.
- See `docs/developer/zustand-selector-stability.md` for examples and review checklist.

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

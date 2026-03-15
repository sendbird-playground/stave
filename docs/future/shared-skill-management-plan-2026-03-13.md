# Shared Skill Management Execution Plan (2026-03-13)

## Goal

- Add a shared skill-discovery and management flow for both Claude and Codex inside Stave.
- Add a `PromptInput` trigger such as `$` that opens a searchable popup so users can find and insert skills while composing a prompt.

## Current State

- `PromptInput` already has a slash-command palette and keyboard navigation flow.
- Settings already expose `skillsEnabled` and `skillsAutoSuggest`, but there is no installed-skill catalog or selection UI yet.
- The Electron bridge exposes provider runtime APIs, but no skill catalog API.
- The current local agent layout supports a natural shared-plus-provider model:
  - `~/.agents/skills` for shared skills
  - `~/.agents/claude/skills` for Claude-specific overlays
  - `~/.agents/codex/skills` for Codex-specific overlays

## Delivery Split

### Phase 1: Discovery, Visibility, and Prompt Selection

#### Objectives

- Make installed skills visible inside Stave without adding filesystem mutation yet.
- Let users discover and insert skills from `PromptInput` with a `$` trigger.
- Keep the first implementation low-risk by reusing the existing slash-palette patterns.

#### Scope

1. Add a new Electron `skills` catalog API.
2. Scan shared and provider-specific skill directories.
3. Normalize skill entries into a renderer-safe catalog shape.
4. Extend the Skills settings section from toggle-only to catalog visibility.
5. Add `$`-triggered skill search in `PromptInput`.
6. Parse selected `$skill-name` tokens before send and convert them into a normalized provider prompt section.
7. Add tests and docs for catalog parsing, filtering, and prompt insertion behavior.

#### Proposed Architecture

- Introduce a dedicated bridge surface instead of overloading `window.api.provider`.
- Normalize every skill as:
  - `id`
  - `name`
  - `summary`
  - `providers`
  - `sourceScope` (`shared`, `claude`, `codex`, `system`)
  - `path`
  - `realPath`
- Dedupe linked skills by resolved real path so shared skills do not appear multiple times when provider directories point at the same target.
- Reuse the `PromptInput` palette interaction model:
  - `$` opens the skill popup
  - `ArrowUp` and `ArrowDown` move selection
  - `Tab` inserts highlighted skill
  - `Escape` dismisses the popup
- Keep the visible draft text simple by inserting `$skill-name` inline.
- On submit, normalize detected skill tokens into a `[Selected Skills]` block before the prompt is sent to the provider runtime.

#### Out of Scope

- Installing or removing skills from the UI
- Creating or deleting symlinks
- Provider-specific enable/disable mutation
- Chip-based multi-select UI
- Workspace-local skill directories beyond the current `~/.agents/...` layout

#### Done Criteria

- Users can inspect installed skills from the Settings dialog.
- Users can type `$` in `PromptInput`, search skills, and insert one without leaving the input field.
- Shared skills and provider-specific skills are grouped clearly and filtered consistently.
- Inline skill tokens are normalized into provider-facing prompt context before a turn is sent.
- Phase 1 has regression coverage for catalog parsing, palette filtering, and send-path normalization.

### Phase 2: Full Skill Management and Provider-Aware Controls

#### Objectives

- Move from visibility-only into actual skill management.
- Add stronger provider-aware affordances once the catalog model is stable.

#### Scope

1. Add install, remove, link, and unlink flows for supported skill directories.
2. Support explicit provider targeting from the UI.
3. Add richer selected-skill presentation, including optional chip UI and recent selections.
4. Add context-driven auto-suggestion when skill matching is enabled.
5. Add diagnostics for catalog refresh, broken symlinks, and incompatible provider scope.

#### Candidate Enhancements

- One-click "install for Claude", "install for Codex", or "install shared"
- Broken-link and duplicate diagnostics in the Skills settings view
- Recent and pinned skills in `PromptInput`
- Provider-aware filtering that can hide or gray out incompatible skills
- Optional per-task persistence of selected skills beyond raw inline tokens

#### Dependencies

- Phase 1 catalog API and normalization shape must be stable.
- The team must decide whether provider dispatch should rely on normalized prompt context, structured metadata, or both.
- Filesystem mutation UX needs clear approval and recovery behavior.

#### Done Criteria

- The app can manage skill presence across shared and provider-specific directories from the UI.
- Users can see and recover from broken, duplicated, or incompatible skill installations.
- Skill selection becomes faster than raw text entry for repeat workflows.

## Decision Gates for Morning Review

1. Should Phase 1 normalize `$skill` tokens into a provider-facing prompt block, or should it only insert raw tokens and defer interpretation?
2. Should incompatible skills be hidden in `PromptInput`, or displayed in a disabled state with a provider badge?
3. Is "management" in Phase 2 limited to visibility plus enable/disable, or does it explicitly include install/remove and symlink operations?
4. Should workspace-local skill directories be included in a later phase, or stay out of scope for now?

## Recommended Next Slice

- Approve Phase 1 only.
- Keep the first delivery focused on catalog discovery, settings visibility, `$` popup insertion, and send-path normalization.
- Defer filesystem mutation and richer management UX until the catalog and prompting model are proven in use.

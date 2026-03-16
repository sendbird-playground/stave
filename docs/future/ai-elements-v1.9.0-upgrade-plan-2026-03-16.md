# AI Elements v1.9.0 Upgrade Plan

Last reviewed: 2026-03-16  
Upstream version reviewed: `ai-elements@1.9.0`  
Upstream release date: 2026-03-12

Sources:

- GitHub release: <https://github.com/vercel/ai-elements/releases/tag/ai-elements%401.9.0>
- npm package: <https://www.npmjs.com/package/ai-elements/v/1.9.0>

## Purpose

Track which `ai-elements@1.9.0` changes are relevant to Stave's vendored `src/components/ai-elements/` fork, what has already been applied, and what should happen next.

## Current status

Already applied in Stave:

- Suggestion API alignment in `src/components/ai-elements/suggestion.tsx`
- `ChatInput` usage updated to the `Suggestion` / `Suggestions` contract
- Visible `Suggestions` label added above the prompt suggestion row

Deferred for later work:

- Screenshot capture support in the prompt input
- Streaming markdown renderer modernization
- Any AI SDK `UIMessage` convergence work

Not applicable to the current Stave fork:

- `Persona` Vite dev-mode fix
- `JSXPreview` streaming fix
- `FileTree` icon and folder-click behavior fixes
- `TerminalStatus` shimmer fallback removal

## Scope constraints in Stave

These constraints explain why only part of the upstream release can be adopted directly:

- Stave vendors only a subset of AI Elements components under `src/components/ai-elements/`.
- Stave prompt attachments are currently modeled as `attachedFilePaths: string[]`, meaning workspace file paths rather than arbitrary browser `File` objects.
- Stave submits attached files by opening them in the editor and forwarding text file context, not by sending binary/image attachments to providers.
- Stave's message renderer is a custom `react-markdown` implementation in `src/components/ai-elements/message-markdown.tsx`, not upstream `Streamdown`.

## Recommended plan

### 1. Keep the applied suggestion alignment

Status: done

Why:

- This is the cleanest low-risk UI alignment with recent AI Elements patterns.
- It improves API consistency without changing provider/runtime behavior.

Files already updated:

- `src/components/ai-elements/suggestion.tsx`
- `src/components/ai-elements/index.ts`
- `src/components/session/ChatInput.tsx`

### 2. Expand the attachment model before adding screenshot capture

Status: recommended next step

Why:

- The most directly relevant new `v1.9.0` feature for Stave is upstream `PromptInputActionAddScreenshot`.
- Stave cannot safely adopt it until prompt attachments support more than workspace file paths.

Required work:

- Replace `attachedFilePaths: string[]` with a typed attachment model that can represent:
  - workspace text files
  - temporary screenshots
  - potentially provider-native binary attachments later
- Define where temporary screenshots live and how they are cleaned up.
- Update prompt draft persistence and replay schemas to store the richer attachment shape.
- Update the prompt input UI to preview and remove both text-file and image attachments.
- Update provider request building so Claude/Codex receive a meaningful attachment representation.

Open design decisions:

- Should screenshots be stored under the workspace, app data, or OS temp storage?
- Should unsupported providers silently drop image attachments, block send, or convert them to a text note?
- Do screenshots need to appear in session replay as first-class artifacts?

Acceptance criteria:

- A screenshot can be captured from the prompt input and attached without leaving the composer.
- The draft survives app reload with attachment metadata intact.
- Unsupported providers are handled explicitly rather than failing silently.

### 3. Revisit the message renderer separately

Status: later, only after attachment-model work is settled

Why:

- Upstream `v1.9.0` includes `Streamdown` updates and a fix for message response updates during animation.
- Stave's renderer is intentionally customized for file-link handling, code blocks, tables, and local font-size settings.
- A direct upstream swap would be high-risk and is not required for the prompt-input upgrade path.

Required evaluation:

- Compare current `react-markdown` behavior against `Streamdown` on partial/streaming markdown.
- Preserve Stave-specific file-link opening behavior.
- Preserve the current code-block header/actions UI.

Acceptance criteria:

- No flicker/regression while assistant output is streaming.
- File path links still open the editor correctly.
- Existing markdown/table/code rendering remains stable.

### 4. Treat `UIMessage` convergence as backlog, not an immediate port

Status: backlog

Why:

- Upstream's `ConversationMessage` to `UIMessage` update is relevant only if Stave decides to use AI SDK UI message objects directly in renderer components.
- Today Stave uses its own chat/provider data model.

Trigger for future work:

- Revisit this only if renderer components start accepting AI SDK `UIMessage` objects directly.

## Suggested implementation order

1. Keep the suggestion alignment already merged into the local fork.
2. Design and land a typed attachment model.
3. Add screenshot capture on top of that model.
4. Evaluate `Streamdown` only after the attachment work is complete.
5. Ignore `UIMessage` convergence until renderer data-model strategy changes.

## Notes

- This document is intentionally scoped to AI Elements `v1.9.0` review work for Stave.
- It is a planning note, not a commitment to ship every upstream change.

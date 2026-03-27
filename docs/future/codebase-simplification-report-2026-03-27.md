# Codebase Simplification Report (2026-03-27)

## Summary

The simplification plan from 2026-03-26 has now been converted into code changes across renderer state, provider contracts, provider runtimes, and tests.

This was not a cosmetic refactor. The main goal of the batch was to reduce duplicated contract logic and move high-risk coordination points behind shared modules.

## What Landed

### Phase 0: Guardrails

Completed:

- exported a reusable `RuntimeOptionsObjectSchema`
- added contract tests for runtime option keys
- added contract tests for normalized provider event discriminants

Result:

- schema drift is now more likely to fail in tests instead of surfacing later as runtime breakage

### Phase 1: Runtime Option Unification

Completed:

- introduced `src/lib/providers/runtime-option-contract.ts`
- centralized shared runtime option lists, timeout constants, formatters, and contract keys
- switched provider settings UI to use shared option metadata instead of ad hoc repeated definitions

Result:

- fewer duplicated option declarations
- better consistency between Settings and ChatInput runtime controls

### Phase 2: Store Extraction

Completed:

- extracted provider runtime option assembly into `src/store/provider-runtime-options.ts`
- extracted replay application for workspace sessions into `src/store/workspace-turn-replay.ts`
- extracted reusable chat/provider-turn state patch helpers into `src/store/chat-state-helpers.ts`
- extracted provider-turn runtime dispatch and event batching into `src/store/provider-turn-runtime.ts`
- extracted workspace runtime cache projection and event-application helpers into `src/store/workspace-runtime-state.ts`
- reduced `app.store.ts` by delegating provider runtime option serialization and replay transitions

Result:

- less duplicated store logic
- cleaner boundaries around provider turn orchestration
- `app.store.ts` dropped from about 4067 LOC to about 3733 LOC while keeping the public store surface unchanged
- the `sendUserMessage` path now separates message-state patching and provider runtime dispatch from the store action body
- active/inactive workspace replay application now lives behind a dedicated helper boundary instead of inside the store action callback

### Phase 3: Shared Provider Runtime Core

Completed:

- introduced `electron/providers/runtime-shared.ts`
- centralized boolean env parsing, sanitized child-process env setup, semver parsing, version probing, and PATH summarization
- updated Claude, Codex, and provider availability probing to use the shared runtime helpers

Result:

- less duplicated CLI/runtime setup code
- tighter Claude/Codex symmetry

### Phase 4: UI Decomposition

Completed:

- extracted ChatInput runtime-control and runtime-status construction into `src/components/session/chat-input.runtime.ts`
- converted provider settings sections to shared runtime option metadata
- extracted shared settings-dialog primitives into `src/components/layout/settings-dialog.shared.tsx`
- extracted the Providers and Stave Auto settings surface into `src/components/layout/settings-dialog-providers-section.tsx`
- extracted the Developer settings surface into `src/components/layout/settings-dialog-developer-section.tsx`
- extracted the editor tab strip into `src/components/layout/editor-main-tab-strip.tsx`
- extracted the image fullscreen overlay into `src/components/layout/editor-image-preview-overlay.tsx`
- extracted the editor toolbar into `src/components/layout/editor-main-toolbar.tsx`

Result:

- `ChatInput.tsx` is materially smaller
- `settings-dialog-sections.tsx` dropped from about 2071 LOC to about 1236 LOC
- `EditorMainPanel.tsx` dropped from about 1342 LOC to about 1107 LOC
- future settings-section extractions can reuse the same `SettingsCard` / `LabeledField` / `DraftInput` primitives instead of re-embedding them
- runtime UI logic is easier to test and reason about

### Phase 5: Test Harness Improvement

Completed:

- added focused tests for:
  - provider runtime contracts
  - provider runtime option assembly
  - ChatInput runtime helpers

Result:

- the new shared modules are covered directly instead of relying only on broad integration tests

## Validation

The implementation passed:

- `bun run typecheck`
- targeted Bun test suites covering contracts, provider runtimes, command handling, and new runtime helper modules

## Remaining Follow-Up

The main structural risks were reduced, but some larger files still exist:

- `src/store/app.store.ts`
- `src/components/layout/EditorMainPanel.tsx`
- `src/components/session/ChatPanel.tsx`

Those remaining files are now better candidates for incremental follow-up extraction because the shared contract and runtime infrastructure is already in place, and the settings dialog now has reusable extraction primitives.

## Conclusion

The codebase is now materially simpler in the areas that were most likely to cause regression:

- runtime option contracts
- provider/runtime schema synchronization
- provider CLI setup symmetry
- duplicated renderer runtime-control logic

The remaining work is mostly incremental decomposition, not foundational cleanup.

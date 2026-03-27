# Codebase Simplification Report: Phase 2 (2026-03-28)

## Summary

This is a follow-up to the 2026-03-27 simplification report. The previous batch addressed foundational cleanup: runtime option contracts, provider runtime symmetry, and initial store/UI extraction. This batch completes the incremental decomposition work that was identified as remaining follow-up.

The focus was on the four largest files that still carried mixed responsibilities after the first round.

## What Landed

### Store Decomposition: `app.store.ts` (3946 -> 3260 LOC, -17%)

Extracted 4 new utility modules:

- **`src/store/theme.utils.ts`** (174 LOC): Theme token definitions, CSS override generation, dark mode resolution, and font override application. Previously scattered across the store as module-level helpers.

- **`src/store/layout.utils.ts`** (61 LOC): `LayoutState` interface, panel width constants, layout normalization, and diff editor tab detection. These were pure functions with no store dependency.

- **`src/store/project.utils.ts`** (375 LOC): Project path hashing, workspace ID generation, recent project state management (clone, normalize, upsert, capture), workspace init command helpers, branch name sanitization, and array utilities. The largest extraction; all functions were pure with no store mutation.

- **`src/store/editor.utils.ts`** (172 LOC): File language detection, image path detection, provider timeout normalization, and message state patch builders. `applyApprovalState` and `applyUserInputState` were refactored from closure-based functions (calling `useAppStore.setState` internally) into pure state-patch builders, eliminating a hidden coupling to the store singleton.

All previously exported symbols are re-exported from `app.store.ts` for backward compatibility. No import changes are required in consuming files.

### ChatPanel Decomposition: `ChatPanel.tsx` (1012 -> 421 LOC, -58%)

Extracted 2 new component modules:

- **`src/components/session/chat-panel-message-parts.tsx`** (275 LOC): `MessagePartRenderer`, `BackgroundActionsSummary`, `CopyButton`, chain-of-thought step builder, provider display helpers, and tool-type predicates.

- **`src/components/session/chat-panel-file-blocks.tsx`** (346 LOC): `ChangedFilesBlock` (with lazy-loaded `ReactDiffViewer` and diff styles), `ReferencedFilesBlock`, `ImageAttachmentBlock`, `ChangeCount`, and file path helpers.

The remaining `ChatPanel.tsx` is now a clean orchestration module containing `MessageBody`, `MessageRow`, `ChatPanelHeader`, `ChatPanelMessageList`, and the exported `ChatPanel` component.

### EditorMainPanel Decomposition: `EditorMainPanel.tsx` (1111 -> 577 LOC, -48%)

Extracted 1 new module:

- **`src/components/layout/editor-monaco-workspace-support.ts`** (545 LOC): All Monaco editor configuration, TypeScript compiler option management, workspace model synchronization, type definition loading, and source file management. Contains 22 functions and 3 module-level state variables. Only 8 symbols are exported (the rest are internal helpers).

The remaining `EditorMainPanel.tsx` is now focused solely on the React component: editor mounting, tab management, file navigation, and user interactions.

### TurnDiagnosticsPanel Decomposition: `TurnDiagnosticsPanel.tsx` (1178 -> 884 LOC, -25%)

Extracted 2 new modules:

- **`src/components/session/turn-diagnostics-shared.tsx`** (122 LOC): All shared interfaces (`TurnReplayHeaderMeta`, `TurnDiagnosticsPanelProps`, etc.), constants, status badge helpers, and the `DiagnosticsViewToggle` component.

- **`src/components/session/turn-replay-event-cards.tsx`** (191 LOC): `ReplayEventCard`, `ReplayEventDetail`, and `ReplayEventDetailBlock` components.

`TurnReplayHeaderMeta` is re-exported from the main file so `SessionReplayDrawer.tsx` continues to work without import changes.

## Validation

The implementation passed:

- `tsc --noEmit` (zero errors)
- `bun test` (394 pass, 0 fail, 874 assertions across 62 files)

## Metrics

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| `src/store/app.store.ts` | 3,946 | 3,260 | -686 (-17%) |
| `src/components/session/ChatPanel.tsx` | 1,012 | 421 | -591 (-58%) |
| `src/components/layout/EditorMainPanel.tsx` | 1,111 | 577 | -534 (-48%) |
| `src/components/session/TurnDiagnosticsPanel.tsx` | 1,178 | 884 | -294 (-25%) |
| **Total (original files)** | **7,247** | **5,142** | **-2,105 (-29%)** |

New modules created: 9 files, 2,261 LOC total.

## Remaining Follow-Up

The major decomposition targets are now addressed. The following items remain as candidates for future incremental work:

### 1. Further `app.store.ts` reduction (3,260 LOC)

The store is still the largest file. The zustand store body (lines ~450-3260) contains all action implementations inline. Potential next steps:

- **Extract workspace lifecycle actions** (`createWorkspace`, `deleteWorkspace`, `switchWorkspace`, `hydrateWorkspaces`) into a `src/store/workspace-lifecycle.ts` module. These are the longest action bodies and involve complex async flows with IPC calls.
- **Extract project lifecycle actions** (`createProject`, `openProject`, `openProjectFromPath`, `activateProject`) into a `src/store/project-lifecycle.ts` module.
- **Extract editor actions** (`openFileFromTree`, `saveActiveEditorTab`, `checkOpenTabConflicts`, `openDiffInEditor`) into a `src/store/editor-actions.ts` module.
- **Extract task actions** (`createTask`, `archiveTask`, `duplicateTask`, `exportTask`, `viewTaskChanges`, `rollbackTask`) into a `src/store/task-actions.ts` module.

This would require passing `set`/`get` references to external functions, which is a pattern already used by `provider-turn-runtime.ts`.

### 2. `TurnDiagnosticsPanel.tsx` further reduction (884 LOC)

The main component is still large because it contains heavy state management with multiple `useEffect` hooks. A further split could separate the overview view and replay view into distinct sub-components, but this would require threading many state values as props or introducing a local context.

### 3. Test harness simplification

From the original plan (Phase 5), the following test files remain as candidates for splitting:

- `tests/bridge-persistence-regression.test.ts` (~1196 LOC) - could be split by scenario
- `tests/stave-router.test.ts` (~569 LOC)
- `tests/e2e/user-scenarios.e2e.ts` (~658 LOC)

Shared test factories for provider events and workspace snapshots would reduce fixture duplication across suites.

### 4. Settings dialog further extraction

`src/components/layout/settings-dialog-sections.tsx` (1236 LOC after previous round) could benefit from extracting remaining section components (Appearance, Editor, Terminal, Review) into individual files, following the pattern already established by `settings-dialog-providers-section.tsx` and `settings-dialog-developer-section.tsx`.

### 5. ChatInput further extraction

`src/components/session/ChatInput.tsx` remains a large file. The runtime control logic was partially extracted to `chat-input.runtime.ts` in the previous round, but the component itself still carries attachment handling, keyboard shortcuts, and prompt assembly logic that could be further decomposed.

## Conclusion

The codebase decomposition is now substantially complete for the highest-priority targets. The four largest files have all been reduced, with clean module boundaries and no behavioral changes. The remaining work is optional incremental improvement rather than structural cleanup.

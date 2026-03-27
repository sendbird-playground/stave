# Codebase Simplification Plan (2026-03-26)

## Goal

Identify the highest-leverage opportunities to simplify, de-risk, and make Stave easier to change without breaking provider turns, workspace persistence, or editor behavior.

This plan is intentionally biased toward architectural simplification first. The current codebase already has broad test coverage; the bigger problem is coordination cost across store state, IPC contracts, provider runtimes, and large UI surfaces.

## What Was Reviewed

Targeted reading focused on the highest fan-out and highest LOC areas:

- `src/store/app.store.ts`
- `src/components/layout/settings-dialog-sections.tsx`
- `src/components/session/ChatInput.tsx`
- `src/components/session/ChatPanel.tsx`
- `src/components/layout/EditorMainPanel.tsx`
- `electron/providers/claude-sdk-runtime.ts`
- `electron/providers/codex-sdk-runtime.ts`
- `electron/providers/runtime.ts`
- `electron/main/ipc/schemas.ts`
- `src/lib/providers/provider.types.ts`
- `src/lib/providers/schemas.ts`
- `src/lib/session/provider-event-replay.ts`

## Evidence Summary

### 1. `app.store.ts` is a monolith with mixed responsibilities

Current shape:

- about 4.2k LOC
- 48 local helper functions
- 21 `window.api` touchpoints
- 7 direct `persistWorkspaceSnapshot` references

The store currently owns:

- persisted settings
- project and workspace lifecycle
- task lifecycle
- prompt assembly
- provider turn orchestration
- replay of streaming provider events
- filesystem reads and writes
- editor tab lifecycle
- UI layout state

This is the main simplification target because a single change frequently crosses renderer state, IPC, persistence, and provider behavior.

### 2. Runtime settings are duplicated across multiple layers

The same runtime option family is repeated in:

- `src/store/app.store.ts`
- `src/components/layout/settings-dialog-sections.tsx`
- `src/components/session/ChatInput.tsx`
- `src/lib/providers/provider.types.ts`
- `src/types/window-api.d.ts`
- `electron/preload.ts`
- `electron/main/ipc/schemas.ts`
- provider runtime implementations

Observed duplication:

- `settings-dialog-sections.tsx` has 82 `updateSettings(...)` call sites
- `ChatInput.tsx` has 17 `updateSettings(...)` call sites
- `ProviderRuntimeOptions` currently contains 36 option fields
- the IPC Zod schema mirrors those options under strict validation

This creates drift risk whenever a provider option is added, renamed, or re-scoped.

### 3. Claude and Codex runtimes are parallel but only partially abstracted

Both provider runtimes separately implement:

- environment sanitization
- executable discovery and probing
- diagnostics payloads
- resume/conversation restoration
- diff tracker lifecycle
- streaming turn lifecycle
- error shaping

`electron/providers/runtime.ts` also re-implements provider availability probing logic that overlaps with provider-specific runtime concerns.

The duplication is not just code size; it also makes feature parity slower and raises the chance of provider-only regressions.

### 4. Event and schema synchronization is manual

Provider events and IPC payloads are represented in multiple parallel forms:

- TypeScript unions
- Zod discriminated unions
- canonical conversation schemas
- replay logic that maps events to message parts

The repository policy already warns about this explicitly. That warning exists because this is a real maintenance hazard, not a theoretical one.

### 5. Large UI surfaces still carry too much orchestration logic

Largest renderer files:

- `src/components/layout/settings-dialog-sections.tsx` ~2101 LOC
- `src/components/layout/EditorMainPanel.tsx` ~1342 LOC
- `src/components/session/TurnDiagnosticsPanel.tsx` ~1178 LOC
- `src/components/session/ChatPanel.tsx` ~1000 LOC
- `src/components/session/ChatInput.tsx` ~918 LOC

Selector fan-out also stays high:

- `settings-dialog-sections.tsx`: 34 `useAppStore(...)` calls
- `ChatPanel.tsx`: 12 `useAppStore(...)` calls
- `ChatInput.tsx`: 10 `useAppStore(...)` calls

These files are not just large view trees. They also carry option mapping, derived state, persistence triggers, and provider-mode branching.

### 6. Test size suggests architectural friction

The project already has 60 test files, but several suites are oversized:

- `tests/bridge-persistence-regression.test.ts` ~1196 LOC
- `tests/stave-router.test.ts` ~569 LOC
- `tests/e2e/user-scenarios.e2e.ts` ~658 LOC

This is a signal that some tests are compensating for wide integration surfaces rather than protecting small stable units.

## Recommended Priorities

### Priority A: Centralize runtime option definitions

Why first:

- highest leverage for reducing duplication
- low-to-medium implementation risk
- creates a safer base for every later refactor

Recommended direction:

- define provider/runtime option metadata once
- derive UI controls from metadata where practical
- keep one serializer path from settings -> runtime options -> IPC
- add parity tests for TypeScript type and strict Zod schema coverage

Expected outcome:

- fewer sync bugs
- less duplicated UI logic between Settings and ChatInput
- faster provider option evolution

### Priority B: Break `app.store.ts` into slices and service modules

Why second:

- this is the main change amplifier in the codebase
- it currently mixes local state and async side effects
- event replay for active vs inactive workspaces duplicates state transition logic

Recommended direction:

- keep `useAppStore` public surface stable initially
- extract slice modules by domain:
  - settings/layout
  - projects/workspaces
  - tasks/messages
  - provider turn orchestration
  - editor/filesystem
- move async flows into service helpers before changing store shape

Expected outcome:

- smaller review surfaces
- easier targeted tests
- lower chance that unrelated features break each other

### Priority C: Create a shared provider runtime core

Why third:

- Claude and Codex need symmetry
- provider runtimes are large enough that parity bugs are expensive

Recommended direction:

- extract shared CLI runtime utilities:
  - PATH/env normalization
  - executable probing
  - diagnostics envelopes
  - common turn guardrails
  - diff tracker setup/teardown
- keep provider-specific event mapping separate

Expected outcome:

- less duplicated runtime code
- faster provider upgrades
- cleaner availability checks

### Priority D: Reduce UI orchestration inside large components

Why after contract/store cleanup:

- UI decomposition is easier once settings and state boundaries are cleaner

Recommended direction:

- split Settings dialog sections into separate modules
- move ChatInput runtime quick controls into a shared provider-settings presenter
- isolate ChatPanel message-body rendering from state selection
- split EditorMainPanel into Monaco runtime, file-tab state, and view shell pieces

Expected outcome:

- smaller component files
- lower re-render scope
- easier feature work in settings, chat, and editor areas

### Priority E: Simplify tests through factories and narrower suites

Recommended direction:

- introduce shared factories for provider events, workspace snapshots, and runtime options
- split broad regression files into smaller scenario-focused suites
- add contract parity tests so behavior tests do not carry schema validation burden alone

Expected outcome:

- more readable failures
- lower fixture duplication
- faster maintenance when contracts change

## Phased Execution Plan

### Phase 0: Guardrails and Baseline

Deliverables:

- capture a baseline of hot files and test coverage hotspots
- add parity tests for runtime options and normalized provider events
- add one doc that explains the contract chain for provider turn options

Acceptance criteria:

- adding a runtime option fails tests unless all schema layers are updated
- adding a provider event fails tests unless TS and Zod stay aligned

### Phase 1: Runtime Option Unification

Deliverables:

- a single runtime-option definition module
- shared selectors for composing active provider runtime settings
- shared rendering helpers for Settings and ChatInput

Acceptance criteria:

- ChatInput and Settings no longer manually duplicate provider option labels/options
- provider runtime option serialization happens in one place

### Phase 2: Store Slice Extraction

Deliverables:

- extracted modules for workspace/task/editor/provider-turn concerns
- `sendUserMessage` flow split into smaller helpers:
  - prompt assembly
  - local command interception
  - optimistic message append
  - event queue flush
  - inactive-workspace persistence

Acceptance criteria:

- `src/store/app.store.ts` is materially smaller
- event replay logic for active and cached workspaces shares one transition helper

### Phase 3: Shared Provider Runtime Core

Deliverables:

- shared runtime helpers used by both Claude and Codex adapters
- common availability/diagnostics probe path

Acceptance criteria:

- executable/env/diagnostics helpers are not duplicated across both provider files
- provider-specific files focus on SDK mapping and approval/user-input behavior

### Phase 4: UI Surface Decomposition

Deliverables:

- modular settings sections
- extracted ChatInput runtime controls
- extracted ChatPanel message renderers
- isolated Monaco workspace support controller

Acceptance criteria:

- major UI files are reduced toward a more reviewable size
- selector fan-out in top-level components is reduced

### Phase 5: Test Harness Simplification

Deliverables:

- shared factories and fixtures
- narrower regression suites
- contract-focused tests separate from feature-flow tests

Acceptance criteria:

- oversized test files shrink
- common provider and snapshot fixtures live in reusable helpers

## Suggested Order of Work

Use this order to keep risk controlled:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5

Avoid starting with UI breakup or micro-optimizations first. That would move code around without reducing the real coordination costs.

## Success Metrics

Use simple repo-level metrics so progress is easy to verify:

- `src/store/app.store.ts` LOC reduced significantly
- duplicated runtime option declarations reduced to one authoritative source
- provider runtime shared helpers adopted by both Claude and Codex
- top-level settings/chat/editor component files reduced in size
- new parity tests catch missing schema sync work early

## Immediate Next Actions

If this plan is executed incrementally, the best first PR is:

1. add contract parity tests for provider runtime options and normalized events
2. introduce a shared runtime option definition module
3. migrate `ChatInput.tsx` and `settings-dialog-sections.tsx` to that shared definition

That gives a meaningful simplification win without destabilizing provider turns or workspace persistence.

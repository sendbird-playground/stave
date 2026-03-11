# Session Replay Next-Version Plan

Date: 2026-03-11

## Context

The current Session Replay MVP is complete:

- replay moved out of the chat column
- generic tool logs moved into replay
- recent-turn selection exists
- replay filters/grouping exist
- recent-session overview exists
- chat summaries can open replay directly

This follow-up plan is for precision, polish, and deeper inspection workflows.

## Current Gaps

The main remaining limitation is traceability from chat back to exact replay context.

Today:

- chat background-action summaries can open replay in `Replay` + `Tools`
- the drawer can inspect selected turns

But:

- chat messages do not carry a direct `turnId`
- deep links cannot yet preselect the exact historical turn that produced a given summary
- replay cannot yet focus a specific event or expanded group from an external trigger

## Goal

Turn Session Replay from a strong MVP into a precise inspection workbench with exact deep links, richer focus/navigation, and stronger test coverage.

## Workstreams

### 1. Exact Turn Linking

Goal: make chat-originated replay links land on the exact turn that produced the summarized activity.

Tasks:

- add a message-to-turn mapping for assistant messages
- preserve that mapping through replay, hydration, and session restore
- thread `turnId` into replay deep-link requests
- preselect the matching turn when replay opens from chat

Questions:

- should `turnId` live directly on `ChatMessage`, or in a parallel task/message index
- should user messages also store originating turn context, or only assistant messages

### 2. Event and Group Focus

Goal: let external triggers open replay to a more precise inspection target than just a turn and filter.

Tasks:

- support requested replay group expansion
- support requested event focus or sequence anchor
- scroll the replay list to the focused event when present
- highlight the focused event briefly so the landing state is obvious

Questions:

- should focus target use persisted event id, sequence number, or category + nearest event
- how much focus state should survive drawer close/reopen

### 3. Replay Interaction Polish

Goal: improve usability when the replay surface gets large or is used repeatedly in one session.

Tasks:

- remember last selected replay view/filter per task while the app is open
- decide whether collapsed groups should persist per task
- add quicker switching between `Overview` and `Replay`
- review mobile drawer behavior for filtered/grouped replay

Questions:

- should replay state persist only in memory or also to workspace/session snapshot
- should `Overview` remain the default open state after exact deep links are added

### 4. Quality and Safety

Goal: make replay behavior safer to refactor and easier to extend.

Tasks:

- add component-level tests for drawer request handoff
- add regression coverage for exact turn deep-link state
- add tests around cache invalidation for recent-session aggregates
- verify replay behavior across workspace restore and active-turn polling

## Non-Goals

Not part of this next-version plan unless requirements change:

- replacing the current replay drawer with a wholly different navigation surface
- expanding replay into a full standalone page
- unbounded historical loading across the entire workspace by default

## Acceptance Criteria

- chat-originated replay links can land on the exact historical turn
- replay can optionally focus a specific event or expanded category
- drawer state handoff is covered by automated tests
- the new precision features do not regress current replay performance or chat rendering isolation

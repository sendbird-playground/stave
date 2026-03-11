# Session Replay Plan

Date: 2026-03-11

## Goal

Replace the current inline latest-turn diagnostics block with a dedicated session replay surface that separates user-facing chat content from operational turn data.

## Problem

The current chat surface mixes three different layers:

1. User-facing conversation content
2. Operational tool-chain detail
3. Latest-turn diagnostics and persistence metadata

That creates two UX problems:

- the diagnostics block pushes the message list down and steals vertical space from the primary task
- generic tool logs appear both in message content and again in chain-of-thought, which makes chat noisy without helping the user

## Product Direction

### Inline chat should keep only user-relevant state

Keep inline:

- assistant and user text
- approvals and user-input requests
- subagent activity
- code diff / changed files
- referenced files when they are part of the answer
- important non-error notices such as abort, truncation, and no-response

Move out of inline chat:

- generic tool plumbing (`Read`, `Bash`, `grep`, `ls`, similar low-level calls)
- replay/event sequencing detail
- request snapshot and provider session metadata
- event-heavy diagnostics summaries

### Session Replay becomes a dedicated surface

Use a right-side drawer on desktop and a full-screen or top/bottom drawer on smaller viewports.

The replay surface should evolve toward two modes:

1. Overview
   - turn/session statistics
   - files touched
   - provider/model/session ids
   - stop reason, duration, token and cost summary
2. Replay
   - recent turn selector
   - event rail / timeline
   - filtered event list
   - selected event detail

This follows the same core idea as the `ref/images/session-replay.png` reference: keep chat clean and move the debug narrative into a focused inspection surface.

## UX Principles

- Chat is the primary workspace and should not lose height to diagnostics chrome.
- Replay is opt-in and should open on demand instead of being permanently mounted above the conversation.
- The replay surface should read like inspection, not like a second chat transcript.
- Event volume should be summarized first and expanded only when requested.
- Error details should remain accessible without duplicating them inline in multiple places.

## MVP Scope

### Phase 1: Drawer relocation

- add a `Session Replay` trigger to the chat header
- remove the inline diagnostics section from above the message list
- move the current latest-turn diagnostics UI into a dedicated drawer
- rename user-facing copy from `Turn Diagnostics` to `Session Replay`

This phase is intentionally structural. It fixes the layout problem first without yet redesigning the full replay model.

### Phase 2: Content split

- hide generic inline tool cards from the chat stream
- keep only user-visible tool surfaces inline
- move generic tool detail into replay-only event rendering
- reduce chain-of-thought from verbose step detail to compact summaries plus meaningful notices

### Phase 3: Replay workbench

- add overview metrics across recent turns
- add recent-turn selection and event filtering
- add event rail / scrubber style navigation
- add selected-event detail and file/change summaries

## Delivery Status

### Done

- Phase 1 is complete.
- Phase 2 is complete.
- Phase 3A is complete.
- Phase 3B is complete.
- Phase 3C is complete.
- Phase 3D is complete.

### In Progress

- No active phase remains in this plan.

## Phase 3 Breakdown

### 3A: Multi-turn navigation

Goal: move from "latest-turn inspector" to "session replay" by letting the user switch across recent turns without leaving the drawer.

Tasks:

- load a recent turn list for the active task
- add a selected-turn control in the drawer
- bind overview, request snapshot, timeline, and replay detail to the selected turn instead of the implicit latest turn
- keep live polling only for the active selected turn

TODO:

- show recent-turn count and selected-turn metadata near the top of the drawer
- preserve the selected turn when the list refreshes
- fall back to the newest available turn if the selected turn disappears

### 3B: Replay filtering and grouping

Goal: make long event streams scannable instead of forcing the user to read a flat chronological wall.

Tasks:

- add filter chips or grouped sections for tools, edits, approvals, system notices, and errors
- add compact counts for the currently selected turn
- keep replay readable on small screens

TODO:

- decide whether filters should affect overview timeline, replay list, or both
- decide whether grouped events should be collapsible by default

### 3C: Session overview

Goal: promote the drawer from turn diagnostics to session-level inspection.

Tasks:

- summarize recent turns for the active task
- show conversation-level counts for tools, errors, approvals, and diffs
- expose files touched and provider/model spread across recent turns

TODO:

- decide the recent-turn window size
- decide whether session overview should include cost/token rollups or stay turn-scoped until later

### 3D: Replay deep links

Goal: connect the compact chat summary back to the replay surface so the user can jump directly into relevant activity.

Tasks:

- wire the chat background-actions summary to open session replay
- optionally preselect the originating turn and replay view

TODO:

- decide whether deep links should focus a specific event cluster or only the turn
- avoid coupling message-list rendering to replay drawer state

## Immediate Next Slice

The planned replay MVP phases are complete. Any follow-up work should be treated as polish or expansion, not a missing baseline phase.

## Follow-up

Next-version expansion work is tracked in `docs/session-replay-next-version-plan.md`.

## Technical Direction

### Reuse existing persisted turn data

The current implementation already has most of the data needed:

- persisted turn summaries
- replay event loading
- request snapshot loading
- provider conversation ids
- turn diagnostics summarization helpers

The next step is to reframe that data for replay UX rather than keeping it as an inline card.

### Rendering boundaries

- keep message list rendering isolated from replay open/close state
- mount replay content only while open when feasible
- avoid broad subscriptions in the chat body for replay-only data

## Risks

- hiding all tool detail too early could remove context users still need
- replay-only detail must stay easy to reach or debugging becomes harder
- the new surface should not regress mobile usability or keyboard navigation

## Success Criteria

- opening replay no longer pushes the message list down
- chat remains focused on user-facing content
- the replay surface can expose current latest-turn diagnostics without cluttering the chat column
- the follow-up path for moving generic tool logs out of chat is clear and documented

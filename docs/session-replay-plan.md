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

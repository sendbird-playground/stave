# Checkpoint Restore Roadmap (2026-03-29)

## Current shipped scope

As of March 29, 2026, Stave supports a practical checkpoint restore path for Claude compaction boundaries:

- Claude `compact_boundary` events are rendered as checkpoint cards in chat.
- Each checkpoint stores:
  - `trigger` (`auto` or `manual`)
  - `gitRef` captured from `git rev-parse HEAD` at boundary time
- The checkpoint card includes a `Restore` action.
- Restore runs:

```bash
git restore --source=<gitRef> --staged --worktree .
```

- Restore is blocked while the task has an active streaming turn.

## Known limits

- Restore is file-system only. It does not rewind Claude/Codex native conversation state.
- Existing historical checkpoints created before `gitRef` capture was added cannot be restored from the card.
- Codex has no equivalent compact-boundary event in the current runtime path, including the App Server transport.

## Future backlog

1. Claude SDK native restore/fork support
- If the SDK exposes a stable “resume from compact boundary” primitive, wire checkpoint cards to native session rewind/fork instead of file-only git restore.

2. Codex checkpoint parity
- If a future Codex runtime surface adds checkpoint/compaction boundary events, map them into the same `system_event.compactBoundary` model and enable restore cards for Codex tasks.

3. Checkpoint UX upgrades
- Add explicit “restore scope” messaging (files only vs session state).
- Add per-checkpoint safety preview (changed files before restore).
- Add optional confirmation dialog for destructive restores.

4. Backfill strategy for legacy checkpoints
- Evaluate storing best-effort fallback refs for old tasks (for example task-start checkpoint) and label them clearly as approximate restore targets.

## Tracking notes

Primary implementation files for current behavior:

- `electron/providers/claude-sdk-runtime.ts`
- `src/lib/providers/provider.types.ts`
- `src/lib/providers/schemas.ts`
- `src/lib/session/provider-event-replay.ts`
- `src/types/chat.ts`
- `src/store/app.store.ts`
- `src/components/ai-elements/checkpoint.tsx`
- `src/components/session/chat-panel-message-parts.tsx`

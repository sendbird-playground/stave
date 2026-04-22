# CLI Session Architecture Review

> Reviewed: 2026-04-12 — commits `61b3a4b..HEAD` (xterm.js rewrite)

## Current Architecture

Stave's CLI session is split into three hooks:

| Hook | Lines | Responsibility |
|------|-------|---------------|
| `useCliTerminalInstance` | ~393 | XTerm creation, FitAddon, resize, revision counter |
| `useCliSessionManager` | ~682 | 3-step lifecycle (create → attach → resume), I/O routing |
| `CliSessionPanel` | ~435 | Hook composition, store selectors, UI |

The dock terminal uses a parallel path:

| Hook | Lines | Responsibility |
|------|-------|---------------|
| `useTerminalTabManager` | — | Ghostty instances per tab |
| `useTerminalSessionManager` | ~1,157 | Multi-tab session lifecycle, transcript persistence |

### 3-Step Session Lifecycle

```
createCliSession(params)        → { sessionId }
attachSession({ sessionId })    → { attachmentId, screenState, backlog }
resumeSessionStream({ ... })    → stream activated (push events flow)
```

- **Between attach and resume**: PTY output accumulates in `outputChunks` (server side).
  `resumeSessionStream` sets `streamReadyAttachmentId`, drains buffered output into
  `pendingPush`, and schedules the first push flush.
- **`attachmentId`**: UUID generated per attach. Prevents stale detach from killing a
  newer attachment — the detach handler compares IDs before clearing state.

### Output Delivery

- **Push path**: `terminal.output` host-service events → `webContents.send` → preload
  `subscribeSessionOutput` → hook writes to xterm.
- **Poll fallback**: 120 ms interval, `readSession` IPC. Used when push is unavailable.
- **Server-side gate**: `isPushStreamReady()` requires both `activeAttachmentId` and
  `streamReadyAttachmentId` to match. Between attach and resume, output goes to
  `outputChunks` (poll buffer) — not background buffer.

### Session Restoration

- `attachSession` returns `screenState` (serialized from headless mirror) or `backlog`.
- Renderer clears xterm, writes the snapshot, then resizes.
- No client-side event queue — the server gate (`streamReadyAttachmentId`) prevents
  push events from arriving before restoration completes.

---

## Design Choices Worth Noting

1. **`attachmentId` concurrency control** — Prevents stale detach from tearing down a
   newer attachment. Critical for rapid workspace switching.
2. **Server-side headless mirror** — The server serializes full terminal state
   (`@xterm/headless` + `@xterm/addon-serialize`), including alternate screen buffer
   and terminal modes. This avoids client-side mode tracking and rehydrate-sequence
   bookkeeping that other designs require.
3. **`writeErrorCount` tracking** — Detects renderer corruption and surfaces a
   "Restart renderer" UI.
4. **Push + poll dual mode** — Graceful degradation if push delivery is unavailable.
5. **`rendererRevision` guard** — Detects xterm recreation mid-bootstrap and aborts
   stale session attachment.

## Structural Gaps

### Gap 1: No Client-Side Event Gate (Impact: medium)

**What**: Between `attachSession` (which writes screenState to xterm) and
`resumeSessionStream` (which unlocks server push), there is a window. If a push event
is already in-flight from a previous subscription or from a race in the IPC bridge, it
could arrive before screenState is fully written.

**Alternative pattern**: Some designs gate client-side with an `isStreamReadyRef` flag
and a `pendingEventsRef` queue — incoming events buffer until restoration completes,
then flush in order.

**Current mitigation**: Server-side `isPushStreamReady()` blocks push at the source.
This works for the host-service path but doesn't guard against IPC bridge timing.

### ~~Gap 2: No Theme Live-Sync~~ — RESOLVED

The font/theme effect (`useCliTerminalInstance` lines 338–362) watches `isDarkMode` and
calls `resolveTerminalTheme()` which reads CSS custom properties via
`getComputedStyle(document.documentElement)`. Since Tailwind toggles the `.dark` class
on `<html>`, the CSS variables (`--color-terminal`, `--color-terminal-foreground`) are
already updated by the time the effect fires. Theme live-sync works as-is.

### ~~Gap 3: No Alternate Screen / Bracketed Paste Restoration~~ — RESOLVED

The server-side headless mirror uses `@xterm/headless` + `@xterm/addon-serialize`
(`SerializeAddon.serialize()`). This serialization includes alternate screen buffer
content and terminal modes. When `attachSession` returns `screenState`, the full TUI
state (vim, less, htop) is preserved. No client-side mode tracking needed.

### Gap 4: No WebGL Renderer (Impact: low)

**What**: Large output bursts (e.g., build logs, test runs) render slower on the DOM
renderer vs WebGL.

**Alternative pattern**: Load `WebglAddon` asynchronously with DOM fallback on
failure. A global flag prevents retrying WebGL after a GPU crash.

**Current mitigation**: None. DOM renderer is functional but slower for high-throughput
scenarios. This is a performance optimization, not a correctness issue.

---

## Bugs Fixed in This Review

| # | Severity | File | Fix |
|---|----------|------|-----|
| 1 | CRITICAL | `host-service.ts` | Added missing `terminal.resume-session-stream` dispatch case |
| 2 | CRITICAL | `useCliSessionManager` | Second `rendererRevision` check: clear registration + refs before detach |
| 3 | HIGH | `useCliSessionManager` | Close orphan PTY on cancel after `createSession` |
| 4 | HIGH | `useCliSessionManager` | Added `cancelled` checks before `getSlotState` and `createSession` |
| 5 | HIGH | `useCliSessionManager` | Clear `attachedSessionIdRef`/`attachedAttachmentIdRef` on workspace switch |
| 6 | HIGH | `useTerminalSessionManager` | `resumeSessionStream` try/catch in `createNewSession` |
| 7 | HIGH | `useTerminalSessionManager` | `resumeSessionStream` try/catch in `tryReattachExistingSession` |
| 8 | MEDIUM | `CliSessionPanel` | `tasks` moved to ref — removed from `createSession` deps |
| 9 | MEDIUM | `useCliTerminalInstance` | Added `fitAddon.fit()` + resize on visibility restore |
| 10 | MEDIUM | `useTerminalSessionManager` | Added `hydratedRevisionByTabKeyRef` cleanup on workspace switch |
| 11 | LOW | `useCliSessionManager` | Reset `flushScheduledBySessionRef` in `registerSession` |
| 12 | LOW | `useCliSessionManager` | Added `clearSessionRegistration` to bootstrap effect deps |

# Terminal Regression Prevention

This guide explains how Stave should prevent small terminal regressions from repeatedly shipping.

The integrated terminal is not "just another panel". It crosses:

- React rendering
- Zustand subscription boundaries
- browser focus and layout behavior
- Ghostty DOM/runtime behavior
- Electron PTY session lifecycle
- workspace shell persistence

That combination makes terminal bugs easy to reintroduce unless ownership and verification stay explicit.

## Core Principle

Treat the integrated terminal as a platform boundary with explicit lifecycle separation between **PTY sessions** (host-service), **I/O transport** (renderer hooks), and **viewport rendering** (Ghostty-web).

In Stave today, that means:

- `useTerminalSessionManager.ts` owns session lifecycle (attach/detach, create/close) and I/O transport (input flush, output subscription, transcript)
- `useTerminalTabManager.ts` owns tab mount/unmount decisions and Ghostty instance registry
- `useTerminalInstance.ts` owns Ghostty-web WASM lifecycle, DOM rendering, resize, and theme sync
- `TerminalDock.tsx` owns dock chrome
- `CliSessionPanel.tsx` owns full-panel CLI session chrome
- `terminal-surface-styles.ts` owns shared shell-to-terminal inset styling
- `terminal-runtime.ts` (host-service) owns PTY state, slot registry, attach/detach, and output buffering

When that ownership blurs, the same classes of bugs return:

- typing stops working after task or workspace switches
- hidden surfaces spawn or reconnect sessions unexpectedly
- terminal viewport or scroll position jumps
- dock and CLI session surfaces drift apart visually

## Session Lifecycle Model

Stave uses a **hybrid keep-alive + attach/detach** session lifecycle:

### Within the same workspace (CLI/Task/tab switches)

- Ghostty instances stay alive (`display:none` when hidden)
- PTY sessions remain attached and push events continue flowing
- On visibility restore: forced WebGL re-render + resize sync
- **No session disposal, no transcript replay needed**

### Across workspace or project switches

- Ghostty instances are disposed (WebGL context limit)
- PTY sessions are **detached, not killed** (background mode)
- Host-service buffers output in a bounded ring buffer (32MB)
- On return: slot state query -> attach -> backlog hydration -> push resume
- localStorage transcript (2MB) provides pre-detach content; host backlog provides post-detach content

### Session destruction (only these cases)

- Explicit tab close
- Workspace deletion (`closeSessionsBySlotPrefix`)
- Project deletion (all workspaces' sessions)
- App quit (`cleanupAll`)

## Required Check Files

| File | Why it matters |
|------|----------------|
| `src/components/layout/useTerminalSessionManager.ts` | Session lifecycle: attach/detach, create/close, slot reconciliation, I/O transport, transcript |
| `src/components/layout/useTerminalTabManager.ts` | Tab mount/unmount decisions, Ghostty instance registry, status tracking |
| `src/components/layout/useTerminalInstance.ts` | Ghostty-web WASM init, DOM rendering, resize, theme sync, forced re-render on visibility |
| `src/components/layout/TerminalTabSurface.tsx` | Bridges useTerminalInstance to useTerminalTabManager per tab |
| `src/components/layout/pty-session-surface.utils.ts` | Shared pure rules for creation gating |
| `src/components/layout/terminal-surface-styles.ts` | Shared terminal inset/focus styling so dock and CLI surfaces do not diverge |
| `src/components/layout/TerminalDock.tsx` | Dock shell, controls, and surface mounting |
| `src/components/layout/CliSessionPanel.tsx` | CLI shell, controls, and surface mounting |
| `src/components/layout/app-shell.shortcuts.ts` | Keyboard boundary between app shortcuts and terminal-native shortcuts |
| `src/store/workspace-session-state.ts` | Workspace restore semantics for active surfaces and shell state |
| `src/store/app.store.ts` | Terminal and CLI tab lifecycle, workspace snapshot persistence, session cleanup on delete |
| `src/lib/terminal/types.ts` | Terminal types, slot key builder (`buildTerminalSessionSlotKey`), session slot state |
| `electron/main/ipc/terminal.ts` | Main-process bridge: IPC handlers, attach registry, push event routing |
| `electron/host-service/terminal-runtime.ts` | PTY session supervisor: create, attach, detach, close, slot state, background buffer, output bounds |
| `src/types/window-api.d.ts` | Terminal IPC contract exposed to the renderer |

## Ownership Rules

### 1. Keep terminal DOM workarounds in one place

Ghostty-specific DOM behavior such as focus handling, hidden textarea fallback, composition quirks, and resize timing belongs in `useTerminalInstance.ts` or a helper it owns.

Do not add `querySelector("textarea")`, `contenteditable`, or canvas-child assumptions to shell components or unrelated hooks.

### 2. Keep dock and CLI surface spacing shared

If docked terminal and CLI session surfaces need the same visual inset, focus ring, or terminal padding, encode that once in `terminal-surface-styles.ts` or another shared utility.

Do not let the dock use one padding system while the CLI panel uses another.

### 3. Respect the session lifecycle boundaries

- **Renderer unmount = detach** (not close). PTY stays alive.
- **Tab close = close**. Only explicit tab close kills the PTY.
- **Workspace/project delete = close by prefix**. All sessions for that workspace are killed.
- **Visibility hide = keep Ghostty alive** (within same workspace). Use `display:none`.
- **Visibility restore = forced re-render**. Call `renderer.render(wasmTerm, true)` after animation frames.

Do not move PTY lifecycle decisions into React shell components.

### 4. Preserve the shell/runtime split

`TerminalDock.tsx` and `CliSessionPanel.tsx` should describe:

- headers, labels, buttons, badges, error banners, shell layout

`useTerminalSessionManager.ts` should describe:

- when a session exists, how it attaches/detaches, how output enters the terminal, how input is flushed

`useTerminalInstance.ts` should describe:

- Ghostty WASM init, resize, theme sync, focus, re-render on visibility

When shell components start owning runtime behavior, regressions spread faster.

### 5. Keep terminal keyboard boundaries explicit

App shortcuts and shell shortcuts compete for the same key events. Any terminal change that touches focus or keyboard behavior must verify:

- terminal-native Ctrl shortcuts still reach the PTY
- app-level modifier shortcuts still work where intended
- editable vs terminal vs app-shell boundaries remain clear

### 6. Avoid broad terminal subscriptions

Terminal UI is a hot render surface. Widening a Zustand selector around terminal state causes unnecessary rerenders that can destabilize focus and viewport behavior.

### 7. Use shared helpers for slot keys and batch operations

Slot key format (`surface:workspaceId:tabId`) is defined once in `buildTerminalSessionSlotKey` in `src/lib/terminal/types.ts`. Do not hardcode the format elsewhere.

Batch session operations (close, detach) use the `batchSessionOp` factory in `useTerminalSessionManager.ts`. Do not duplicate the pattern.

## Verification Matrix

Use the lightest layer that proves the behavior, but do not stop too early.

### Unit tests

Use `bun test` for pure or narrowly-scoped logic:

- `tests/pty-session-surface.utils.test.ts`
- `tests/terminal-dock.utils.test.ts`
- `tests/terminal-session-slot-registry.test.ts`

These should cover:

- session creation gating
- focus fallback order
- dock auto-create rules
- slot reuse and cleanup semantics
- attach/detach state transitions

### Manual desktop smoke

If a change touches real PTY input, focus restore, Electron IPC wiring, or workspace/session restore behavior, run a manual desktop smoke check:

1. Open a CLI session and type `ls`.
2. Switch to a Task in the same workspace and back. Confirm instant restore, no flicker.
3. Switch to another workspace and back. Confirm content restored via backlog.
4. Switch to another project and back. Confirm PTY still alive, content restored.
5. Close a CLI session tab. Confirm PTY is killed (not just detached).
6. Delete a workspace. Confirm all its terminal sessions are killed.
7. Confirm no duplicate sessions appear.
8. Confirm dock and CLI spacing still match the intended shell inset.

## Review Checklist

Before shipping a terminal change, ask:

- Is session lifecycle (attach/detach/create/close) still in `useTerminalSessionManager.ts`?
- Is Ghostty DOM behavior still in `useTerminalInstance.ts`?
- Did docked terminal and CLI session spacing stay shared?
- Does a hidden surface avoid creating a NEW session (but keep existing ones alive)?
- Does visibility restore trigger a forced WebGL re-render?
- Does unmount call detach (not close)?
- Are slot key strings using `buildTerminalSessionSlotKey` (not hardcoded)?
- Did a store selector widen unnecessarily around the terminal subtree?
- Did I verify both shell layout and actual input behavior?

If any answer is unclear, the change is not done.

## Related Docs

- [Integrated Terminal](../features/integrated-terminal.md)
- [Developer Diagnostics](diagnostics.md)
- [Zustand Selector Stability](zustand-selector-stability.md)
- [Provider Session Stability](provider-session-stability.md)

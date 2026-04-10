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

Treat the integrated terminal as a platform boundary with a single runtime adapter and a small number of explicit shell components.

In Stave today, that means:

- `usePtySessionSurface.ts` owns runtime behavior
- `TerminalDock.tsx` owns dock chrome
- `CliSessionPanel.tsx` owns full-panel CLI session chrome
- `terminal-surface-styles.ts` owns shared shell-to-terminal inset styling

When that ownership blurs, the same classes of bugs return:

- typing stops working after task or workspace switches
- hidden surfaces spawn or reconnect sessions unexpectedly
- terminal viewport or scroll position jumps
- dock and CLI session surfaces drift apart visually

## Required Check Files

| File | Why it matters |
|------|----------------|
| `src/components/layout/usePtySessionSurface.ts` | Single owner for focus restore, transcript replay, resize, output flow, and session gating |
| `src/components/layout/pty-session-surface.utils.ts` | Shared pure rules for creation gating and focus fallback |
| `src/components/layout/terminal-surface-styles.ts` | Shared terminal inset/focus styling so dock and CLI surfaces do not diverge |
| `src/components/layout/TerminalDock.tsx` | Dock shell, controls, and surface mounting |
| `src/components/layout/CliSessionPanel.tsx` | CLI shell, controls, and surface mounting |
| `src/components/layout/app-shell.shortcuts.ts` | Keyboard boundary between app shortcuts and terminal-native shortcuts |
| `src/store/workspace-session-state.ts` | Workspace restore semantics for active surfaces and shell state |
| `src/store/app.store.ts` | Terminal and CLI tab lifecycle plus workspace snapshot persistence |
| `electron/main/ipc/terminal.ts` | PTY session creation, slot reuse, delivery mode, and renderer event flow |
| `src/types/window-api.d.ts` | Terminal IPC contract exposed to the renderer |

## Ownership Rules

### 1. Keep terminal DOM workarounds in one place

Ghostty-specific DOM behavior such as focus handling, hidden textarea fallback, composition quirks, and resize timing belongs in `usePtySessionSurface.ts` or a helper it owns.

Do not add `querySelector("textarea")`, `contenteditable`, or canvas-child assumptions to shell components or unrelated hooks.

```tsx
// ❌ DON'T — shell component reaching into Ghostty internals
function TerminalDock() {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const textarea = containerRef.current?.querySelector("textarea");
    textarea?.focus({ preventScroll: true });
  }, [activeTabKey]);
  // ...
}

// ✅ DO — delegate to the shared focus helper via the adapter hook
// usePtySessionSurface already calls focusTerminalSurface() internally
// on tab switch and visibility restore. The shell component does nothing.
```

### 2. Keep dock and CLI surface spacing shared

If docked terminal and CLI session surfaces need the same visual inset, focus ring, or terminal padding, encode that once in `terminal-surface-styles.ts` or another shared utility.

Do not let the dock use one padding system while the CLI panel uses another.

```tsx
// ❌ DON'T — hardcoded padding in each shell component
// TerminalDock.tsx
<div className="h-full w-full px-4 py-3" />
// CliSessionPanel.tsx
<div className="h-full w-full px-5 py-4" />   // drifted!

// ✅ DO — single shared class name
import { TERMINAL_SURFACE_CLASS_NAME } from "./terminal-surface-styles";
<div className={cn(TERMINAL_SURFACE_CLASS_NAME, !activeTab && "opacity-60")} />
```

### 3. Treat switching flows as product-critical

The terminal must behave correctly across:

- task switch
- workspace switch
- dock show/hide
- CLI session tab switch
- restore from persisted shell state

These are not edge cases. They are the normal usage pattern of the product.

```tsx
// ❌ DON'T — focus only reacts to tab change, misses visibility restore
useEffect(() => {
  return scheduleTerminalFocus();
}, [activeTabKey, terminalReady]);

// ✅ DO — separate effect that also fires on visibility change
useEffect(() => {
  if (!args.isVisible || !activeTabKey || !terminalReady) return;
  return scheduleTerminalFocus();
}, [args.isVisible, activeTabKey, runtimeVersion, terminalReady]);
```

```tsx
// ❌ DON'T — create sessions regardless of surface visibility
useEffect(() => {
  createSession(activeTabKey);
}, [activeTabKey]);

// ✅ DO — gate session creation on visibility and workspace presence
if (!shouldCreatePtySession({ isVisible, workspaceId, hasActiveTab })) return;
```

### 4. Preserve the shell/runtime split

`TerminalDock.tsx` and `CliSessionPanel.tsx` should describe:

- headers
- labels
- buttons
- badges
- error banners
- shell layout

`usePtySessionSurface.ts` should describe:

- when a session exists
- how it restores
- where focus goes
- how output enters the terminal
- how resize and scroll restoration work

When shell components start owning runtime behavior, regressions spread faster.

```tsx
// ❌ DON'T — shell component managing session lifecycle
function TerminalDock() {
  useEffect(() => {
    window.api.terminal.createSession({ cols, rows }).then((res) => {
      sessionIdRef.current = res.sessionId;
    });
  }, [activeTab]);
}

// ✅ DO — shell component delegates to the adapter hook
function TerminalDock() {
  const { containerRef, clearActiveTranscript } = usePtySessionSurface({
    // ... declarative config only
  });
  // shell only renders chrome around containerRef
}
```

### 5. Keep terminal keyboard boundaries explicit

App shortcuts and shell shortcuts compete for the same key events. Any terminal change that touches focus or keyboard behavior must verify:

- terminal-native Ctrl shortcuts still reach the PTY
- app-level modifier shortcuts still work where intended
- editable vs terminal vs app-shell boundaries remain clear

```tsx
// ❌ DON'T — global shortcut handler that swallows Ctrl+C unconditionally
function handleKeyDown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === "c") {
    e.preventDefault();
    copyToClipboard();
  }
}

// ✅ DO — check whether the terminal surface is focused first
function handleKeyDown(e: KeyboardEvent) {
  if (isTerminalSurfaceFocused()) return; // let PTY handle it
  if (e.ctrlKey && e.key === "c") {
    e.preventDefault();
    copyToClipboard();
  }
}
```

### 6. Avoid broad terminal subscriptions

Terminal UI is a hot render surface. Widening a Zustand selector around terminal state causes unnecessary rerenders that can destabilize focus and viewport behavior.

```tsx
// ❌ DON'T — subscribe to the entire workspace slice
const workspace = useAppStore((s) => s.workspaces.find((w) => w.id === id));
// every workspace field change rerenders the terminal surface

// ✅ DO — narrow selector with useShallow
const { terminalTabs, activeTerminalTabId } = useAppStore(
  useShallow((s) => ({
    terminalTabs: s.terminalTabsByWorkspaceId[id] ?? [],
    activeTerminalTabId: s.activeTerminalTabIdByWorkspaceId[id],
  })),
);
```

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

### Playwright smoke coverage

Use `tests/e2e/` for browser-level shell regressions that are still worth catching cheaply:

- terminal dock opens from workspace chrome
- terminal surface mounts inside the shell
- workspace chrome remains stable with terminal visible
- controls for docked terminal shell are present

If a change alters visible terminal shell behavior, add or update a Playwright smoke.

### Manual desktop smoke

If a change touches real PTY input, focus restore, Electron IPC wiring, or workspace/session restore behavior, run a manual desktop smoke check:

1. Open the docked terminal and type.
2. Open a CLI session and type.
3. Switch to another task or workspace and back.
4. Confirm typing still works.
5. Confirm no duplicate session appears.
6. Confirm dock and CLI spacing still match the intended shell inset.

## Review Checklist

Before shipping a terminal change, ask:

- Is `usePtySessionSurface.ts` still the only place that knows terminal internals?
- Did docked terminal and CLI session spacing stay shared?
- Does a hidden surface avoid creating a session?
- Does a visible surface restore focus deterministically?
- Did a store selector widen unnecessarily around the terminal subtree?
- Did I verify both shell layout and actual input behavior?

If any answer is unclear, the change is not done.

## Related Docs

- [Integrated Terminal](../features/integrated-terminal.md)
- [Developer Diagnostics](diagnostics.md)
- [Zustand Selector Stability](zustand-selector-stability.md)

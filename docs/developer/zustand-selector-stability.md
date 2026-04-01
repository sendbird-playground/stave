# Zustand Selector Stability

This guide documents the renderer rule that matters most for React 19 + Zustand 5 in Stave:

**a Zustand selector must not manufacture a new snapshot every render unless the equality strategy explicitly supports it.**

If a selector returns a fresh object or array on every render, React can repeatedly force a store re-render and eventually crash with:

```text
Maximum update depth exceeded
```

## Scope

Apply this guidance to:

- `useAppStore(...)`
- any direct `useStore(...)` usage
- any custom hook built on `useSyncExternalStore`

## Default rule

Use selectors to read store state, not to build new containers.

- Safe by default:
  - primitives
  - existing object references from store state
  - existing array references from store state
  - tuple/object selectors wrapped with `useShallow`, when each returned value is itself stable
- Suspicious by default:
  - `{ ... }`
  - `[ ... ]` without `useShallow`
  - `.map(...)`
  - `.filter(...)`
  - `.slice(...)`
  - `new Map(...)`
  - `new Set(...)`
  - `() => ...`
  - `?? []`
  - `?? {}`

## Repo conventions

### 1. Prefer primitive or existing-reference selectors

Good:

```tsx
const activeTaskId = useAppStore((state) => state.activeTaskId);
const tasks = useAppStore((state) => state.tasks);
const activeTask = useAppStore((state) => state.tasks.find((task) => task.id === state.activeTaskId) ?? null);
```

Why this is acceptable:

- `activeTaskId` is a primitive
- `tasks` is the existing store array reference
- `.find(...)` returns an existing task object from the store, not a new cloned object

### 2. When selecting multiple values, use `useShallow`

Good:

```tsx
const [activeTaskId, activeTurnId, createTask] = useAppStore(useShallow((state) => [
  state.activeTaskId,
  state.activeTurnIdsByTask[state.activeTaskId],
  state.createTask,
] as const));
```

Prefer tuple selectors over object selectors because they make accidental object allocation more obvious.

### 3. Never build derived objects inside a plain selector

Bad:

```tsx
const pendingUserInput = useAppStore((state) => {
  const messages = state.messagesByTask[state.activeTaskId] ?? [];
  const lastMessage = messages.at(-1);
  if (!lastMessage) return null;
  const part = findLatestPendingUserInputPart({ message: lastMessage });
  if (!part) return null;
  return { messageId: lastMessage.id, part };
});
```

Why this is bad:

- `return { messageId, part }` creates a new object every render
- `?? []` creates a new fallback array every render

Good:

```tsx
const EMPTY_MESSAGES: ChatMessage[] = [];

const [pendingUserInputMessageId, pendingUserInputPart] = useAppStore(useShallow((state) => {
  const messages = state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES;
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    return [null, null] as const;
  }
  const part = findLatestPendingUserInputPart({ message: lastMessage });
  return [lastMessage.id, part ?? null] as const;
}));

const pendingUserInput = useMemo(() => {
  if (!pendingUserInputMessageId || !pendingUserInputPart) {
    return null;
  }
  return {
    messageId: pendingUserInputMessageId,
    part: pendingUserInputPart,
  };
}, [pendingUserInputMessageId, pendingUserInputPart]);
```

### 4. Derive filtered / mapped arrays after subscription

Bad:

```tsx
const visibleMessages = useAppStore((state) =>
  (state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES).filter((message) => !message.isPlanResponse)
);
```

Good:

```tsx
const messages = useAppStore((state) => state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES);
const visibleMessages = useMemo(
  () => messages.filter((message) => !message.isPlanResponse),
  [messages],
);
```

### 5. Use module-level empty fallbacks

Bad:

```tsx
const messages = useAppStore((state) => state.messagesByTask[state.activeTaskId] ?? []);
```

Good:

```tsx
const EMPTY_MESSAGES: ChatMessage[] = [];

const messages = useAppStore((state) => state.messagesByTask[state.activeTaskId] ?? EMPTY_MESSAGES);
```

Inline `[]` and `{}` fallbacks are new references. Module-level constants are stable.

## Review checklist

Before finishing any renderer work that touches Zustand subscriptions, scan selectors and ask:

1. Does this selector return a new object, array, function, `Map`, or `Set`?
2. Does it use `?? []`, `?? {}`, or another inline fallback allocation?
3. Does it call `.map()`, `.filter()`, `.slice()`, or object spread inside the selector?
4. If it returns multiple values, is it using `useShallow`?
5. Could the derived value be moved to `useMemo` after subscription instead?

If any answer is "yes", the selector is probably wrong for this repo.

## High-risk surfaces in Stave

Be especially strict in these files and flows:

- `src/components/session/ChatInput.tsx`
- `src/components/session/PlanViewer.tsx`
- `src/components/session/ChatPanel.tsx`
- `src/components/layout/ProjectWorkspaceSidebar.tsx`
- `src/components/layout/WorkspaceTaskTabs.tsx`
- plan mode entry / exit
- task switching
- workspace switching
- streaming session UI
- replay drawers / diagnostics surfaces

## Verification

After touching selector-heavy renderer code:

1. Run `bun run typecheck`.
2. Run the most relevant `bun test` targets.
3. Manually exercise the affected UI flow if it involves hot subscriptions, streaming, or task/workspace transitions.
4. If a render loop is suspected, enable the render profiler in `docs/developer/diagnostics.md`.

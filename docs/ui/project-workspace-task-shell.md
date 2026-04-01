## Project / Workspace / Task Shell Redesign

### Goal

Replace the legacy workspace/task shell with a three-part layout:

1. Left sidebar: `Projects > Workspaces`
2. Center top strip: task tabs for the selected workspace
3. Right rail: VS Code-like vertical action strip

### Implemented Layout

- The left project list is full-height and reaches the top edge of the app shell.
- The top bar now applies only to the main work area, not the left project list.
- The top bar shows the selected workspace path for the current workspace.
- The top bar exposes an always-visible quick-open file search input, and `Cmd/Ctrl+P` focuses it from anywhere outside text inputs.
- Everything below the top bar is now a two-column region: a left workspace column and the right rail.
- The left workspace column contains the selected workspace's task tab strip plus the main chat/editor surface.
- The right rail spans the full region below the top bar, so the task tabs share row width with the rail.
- Below `lg`, the rail remains visible in a compact form and editor or explorer/changes still occupy a dedicated right-side panel column beneath the top bar, so the task tabs and main workspace shrink to make room.

### Confirmed UX Decisions

- Task tabs belong to the selected workspace, not the left project list.
- `Cmd/Ctrl+N` should create a new task in the selected workspace, and `Cmd/Ctrl+W` should archive the currently selected task.
- Task tab close should confirm before archiving.
- Project delete removes the project from Stave's list only.
- Workspace rows show a responding indicator if any child task is actively running, including inactive workspaces.
- Workspace rows should show the responding-task count in the trailing action slot, and swap that slot to `Archive` on row hover.
- Default workspace icons should use a neutral gray chip, while non-default worktree icons should use deterministic name-hashed blue accents.
- Project and workspace order should stay stable while navigating.
- Project and workspace order can be adjusted manually from a dedicated sidebar edit mode.
- Task list order should stay stable and support manual drag-and-drop reordering.
- The selected workspace should read as the primary active state, while project rows can stay visually neutral.
- The explorer should lazy-load folder contents, keep empty folders visible, and reuse in-memory directory caches until refresh or structural changes invalidate them.
- `Open Project` should live as a compact icon action in the expanded `Projects` header instead of an inverse-filled CTA.
- The Stave app menu should live in the compact top-left sidebar header instead of the top bar.
- The full project list sidebar should be collapsible.
- The top-left sidebar header should match the main top bar height.
- Project rows should show a dedicated project icon on the far left.
- Project accordion chevrons should stay hidden until project-row hover and appear over the project icon to indicate expand/collapse state.
- Project-row hover actions should reveal `New workspace` and `Project settings`, while project removal lives under Settings > Projects.

### State Model Change

- The active workspace still uses the top-level store fields.
- Inactive workspaces now keep an in-memory runtime cache in `workspaceRuntimeCacheById`.
- Tasks are mapped back to their owning workspace through `taskWorkspaceIdById`.
- Provider stream events are replayed into either the active workspace state or the cached inactive workspace session, depending on task ownership.
- When an inactive workspace stream completes, its session snapshot is persisted.

### Workspace Integrity Warning

> Project root, default workspace id, workspace path, and task ownership must never drift apart.
> A `workspaceDefaultById` flag alone is not a trusted source of truth.
> Any future change in this shell must preserve path-aware default workspace resolution, task-owned cwd resolution, and boot-time self-healing of corrupted project registry entries.

See `docs/architecture/workspace-integrity.md` before changing the shell, hydration flow, notification routing, or task-scoped git actions.

### UI Components

- `ProjectWorkspaceSidebar`
  - renders `recentProjects` plus the current project as a collapsible project tree
  - hosts the Stave app menu in a compact top-left header beside the collapse control
  - can collapse into a narrow rail
  - keeps the top-left header aligned to the same height as the main top bar
  - shows a compact `Projects` header with `Open Project` and reorder controls in expanded mode
  - provides `Open Project`, hover-revealed per-project workspace creation, and direct project-settings entry points
  - keeps project order stable instead of re-sorting by recent selection
  - exposes dedicated drag handles for project and workspace reordering only while reorder mode is enabled
  - shows a wave indicator plus the count of responding tasks when any task in that workspace is responding, then swaps that trailing slot to `Archive` on hover for archivable workspaces
  - uses stronger visual emphasis for the selected workspace while keeping project rows neutral
  - shows project folder icons on project rows and keeps workspace identity icons visible on workspace rows, with gray for the default workspace and deterministic blue tones for named worktrees
  - shows workspace shortcuts in the collapsed rail and includes the parent project name in the tooltip
- `SettingsDialog`
  - includes a `Projects` section with a dedicated project menu and a single detail panel for the selected project
  - keeps repository workspace defaults, git metadata, close action, and project removal inside that selected-project panel instead of the main sidebar row
- `WorkspaceTaskTabs`
  - renders active tasks as horizontal tabs for the selected workspace
  - uses one shared leading slot for responding wave or model icon
  - supports drag-and-drop reordering directly in the tab strip
  - exposes the archive action with confirmation, per-task overflow menu, and workspace-level `Task History`
  - keeps notification deep-links explicit for archived tasks by routing to the owning workspace first, then requiring an explicit restore before the task reopens
- `RightRail`
  - moves the old workspace-bar utility toggles into a vertical strip on the far right
  - exposes a workspace information panel for Jira links, Figma references, PR metadata, notes, todos, saved plans, and custom structured fields
  - surfaces workspace-level plan history from markdown files under `.stave/context/plans`, while still showing legacy `.stave/plans` files
  - stays visible at every breakpoint, using a narrower compact treatment below `lg`
  - keeps terminal independent while making editor and explorer/changes mutually exclusive on small widths
  - opens its right-side panels as full-height siblings under the top bar instead of placing them beneath the task-tabs row
- `EditorPanel`
  - loads explorer folders on demand instead of materializing the full tree from `projectFiles`
  - caches loaded directory entries in memory for the active workspace until refresh, workspace switch, or add file/folder invalidation
  - keeps empty folders visible because directory entries now come from folder listings instead of file-only scans

### Store Behavior

- `switchWorkspace()` no longer interrupts live turns.
- The current active workspace is cached before switching away.
- Re-opening a workspace restores the cached runtime session first, then falls back to persisted snapshot data.
- Workspace hydration automatically imports branch-backed git worktrees that exist on disk but are missing from Stave's workspace DB.
- `removeProjectFromList()` only removes the project from Stave's recent list and clears associated cached runtime state.
- `moveProjectInList()` and `moveWorkspaceInProjectList()` allow explicit sidebar ordering without auto-reordering on selection.
- `reorderTasks()` persists manual task ordering within the active, archived, or all-task filter views.
- `restoreTask()` re-activates archived tasks from workspace task history.

### Files Changed

- `src/store/app.store.ts`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/TopBar.tsx`
- `src/components/layout/EditorPanel.tsx`
- `src/components/session/ChatArea.tsx`
- `src/components/layout/ProjectWorkspaceSidebar.tsx`
- `src/components/layout/WorkspaceTaskTabs.tsx`
- `src/components/layout/RightRail.tsx`
- `src/lib/tasks.ts`
- `package.json`

### Verification Focus

- Workspace switch should not drop live status for inactive workspaces.
- Task archive from tab close should preserve history.
- Project removal should not touch filesystem data.
- Explorer / editor / terminal actions should still work from the right rail.
- Workspace information should persist across workspace switches and app restart.
- On narrow widths, task tabs should stay visible while the compact rail remains pinned and right-side panels reduce the remaining workspace width from the top of the shell.
- Explorer refresh should invalidate cached folder entries and repopulate the currently expanded folders.

# Workspace PR Status

*Added 2026-03-30*

## Overview

Each non-default workspace maps 1:1 to a git worktree branch.
This feature fetches the GitHub PR associated with that branch, derives a single status enum, and surfaces it in two places:

1. **Sidebar** — workspace row icon reflects PR lifecycle state with semantic color
2. **Top bar** — "Create PR" button becomes a PR status hub with contextual actions

Default workspaces (typically `main`) are excluded; they never carry a PR.

## Status Model

### Enum

```ts
type WorkspacePrStatus =
  | "no_pr"            // branch has no associated PR
  | "draft"            // PR is open in draft mode
  | "review_required"  // open, awaiting first approval
  | "changes_requested"// reviewer requested changes
  | "checks_pending"   // CI / status checks still running
  | "checks_failed"    // required checks failed
  | "merge_conflict"   // GitHub reports CONFLICTING mergeable state
  | "behind_base"      // head is behind the base branch
  | "ready_to_merge"   // approved + checks pass + mergeable
  | "merged"           // PR was merged
  | "closed_unmerged"; // PR closed without merge
```

### Derivation Priority

Raw GitHub fields → single enum, evaluated top to bottom (first match wins):

| Priority | Condition | Status |
|----------|-----------|--------|
| 1 | `mergedAt` set or `state = MERGED` | `merged` |
| 2 | `state = CLOSED` | `closed_unmerged` |
| 3 | `isDraft = true` | `draft` |
| 4 | `mergeable = CONFLICTING` | `merge_conflict` |
| 5 | `mergeStateStatus = BEHIND` | `behind_base` |
| 6 | `reviewDecision = CHANGES_REQUESTED` | `changes_requested` |
| 7 | `checksRollup = FAILURE` | `checks_failed` |
| 8 | `checksRollup = PENDING` | `checks_pending` |
| 9 | `reviewDecision` is empty / `REVIEW_REQUIRED` | `review_required` |
| 10 | everything else | `ready_to_merge` |

### Raw GitHub Fields

Fetched via `gh pr view --json`:

| Field | Source |
|-------|--------|
| `number`, `title`, `state`, `isDraft`, `url` | PR metadata |
| `reviewDecision` | `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`, or empty |
| `mergeable` | `MERGEABLE`, `CONFLICTING`, `UNKNOWN` |
| `mergeStateStatus` | `BEHIND`, `BLOCKED`, `CLEAN`, `DIRTY`, `DRAFT`, ... |
| `statusCheckRollup` | Array of CheckRun/StatusContext objects → derived to single rollup |
| `mergedAt`, `baseRefName`, `headRefName` | Merge and branch info |

The `statusCheckRollup` array is collapsed into a single `"SUCCESS" | "FAILURE" | "PENDING" | null` on the main process side before reaching the renderer.

## Visual Mapping

### Icons (Lucide)

| Status | Icon | Color Token |
|--------|------|-------------|
| `no_pr` | `GitPullRequestCreateArrow` | `muted` |
| `draft` | `GitPullRequestDraft` | `muted` |
| `review_required` | `GitPullRequest` | `primary` |
| `changes_requested` | `GitPullRequest` | `destructive` |
| `checks_pending` | `GitPullRequest` | `warning` |
| `checks_failed` | `GitPullRequest` | `destructive` |
| `merge_conflict` | `GitCompareArrows` | `destructive` |
| `behind_base` | `GitBranch` | `warning` |
| `ready_to_merge` | `GitMerge` | `success` |
| `merged` | `GitMerge` | `success` |
| `closed_unmerged` | `GitPullRequestClosed` | `muted` |

### Color Tokens

All five semantic tokens are defined in `globals.css` and mapped in Tailwind:

| Token | Usage | Tailwind Class |
|-------|-------|----------------|
| `muted` | Inactive / terminal states | `text-muted-foreground` |
| `primary` | Neutral-active states | `text-primary` |
| `warning` | Attention needed | `text-warning` |
| `destructive` | Blocked / failing | `text-destructive` |
| `success` | Ready / merged | `text-success` |

## Architecture

### Data Flow

```
gh pr view --json ...
       │
       ▼
┌─────────────────┐     IPC: scm:get-pr-status
│  Electron Main   │ ◄──────────────────────────── Renderer
│  (scm.ts)        │                                  │
│  • run gh CLI    │                                  │
│  • parse JSON    │     { ok, pr: GitHubPrPayload }  │
│  • derive checks │ ────────────────────────────►    │
│    rollup        │                                  ▼
└─────────────────┘                          ┌───────────────┐
                                             │  app.store.ts  │
                                             │  workspacePr   │
                                             │  InfoById      │
                                             └──────┬────────┘
                                                    │
                                         ┌──────────┴──────────┐
                                         │                     │
                                    Sidebar icon         TopBar PR Hub
                                  (PrStatusIcon)      (DropdownMenu +
                                                       creation dialog)
```

### File Map

| Layer | File | Role |
|-------|------|------|
| Types & derivation | `src/lib/pr-status.ts` | `WorkspacePrStatus`, `GitHubPrPayload`, `derivePrStatus()`, visual config, action config |
| IPC handlers | `electron/main/ipc/scm.ts` | `scm:get-pr-status`, `scm:set-pr-ready`, `scm:merge-pr`, `scm:update-pr-branch` |
| Preload bridge | `electron/preload.ts` | `getPrStatus`, `setPrReady`, `mergePr`, `updatePrBranch` |
| Window API types | `src/types/window-api.d.ts` | Type definitions for the 4 new methods |
| Store | `src/store/app.store.ts` | `workspacePrInfoById`, `fetchWorkspacePrStatus`, `fetchAllWorkspacePrStatuses` |
| Icon component | `src/components/layout/PrStatusIcon.tsx` | Reusable icon renderer: status → Lucide icon + color |
| Sidebar | `src/components/layout/ProjectWorkspaceSidebar.tsx` | Renders `PrStatusIcon` for non-default workspaces |
| TopBar hub | `src/components/layout/TopBarOpenPR.tsx` | PR status badge, dropdown actions, creation dialog |

### IPC Handlers

| Handler | CLI Command | Purpose |
|---------|-------------|---------|
| `scm:get-pr-status` | `gh pr view --json ...` | Fetch PR metadata + derive checks rollup |
| `scm:set-pr-ready` | `gh pr ready` | Convert draft → ready for review |
| `scm:merge-pr` | `gh pr merge --squash --delete-branch` | Squash-merge and delete remote branch |
| `scm:update-pr-branch` | `git fetch origin && git rebase origin/<base>` | Rebase head onto latest base |

All handlers check `gh auth status` before executing.

## Polling Strategy

| Context | Interval | Trigger |
|---------|----------|---------|
| Active workspace (TopBar) | 60 seconds | `useEffect` interval |
| All workspaces (Sidebar) | 5 minutes | `useEffect` interval |
| Manual | On demand | Dropdown "Refresh" item |
| After action | Immediate | Post-create/merge/mark-ready |

PR info is **transient state** — not persisted in `RecentProjectState` or SQLite.
Each session fetches fresh from GitHub on mount.

## TopBar Hub Behavior

The top bar button changes based on status:

| Status | Button Appearance | Click Behavior |
|--------|-------------------|----------------|
| `no_pr` | `[GitPullRequest] Create PR` (primary badge) | Opens PR creation dialog |
| Any other | `[StatusIcon] Status Label` (status-colored badge) | Opens dropdown menu |

### Dropdown Actions by Status

| Status | Primary Action | Secondary Actions |
|--------|---------------|-------------------|
| `draft` | Mark Ready | Open on GitHub, Refresh |
| `review_required` | — | Open on GitHub, Refresh |
| `changes_requested` | — | Update Branch, Open on GitHub, Refresh |
| `checks_pending` | — | Open on GitHub, Refresh |
| `checks_failed` | — | Open on GitHub, Refresh |
| `merge_conflict` | — | Open on GitHub, Refresh |
| `behind_base` | Update Branch | Open on GitHub, Refresh |
| `ready_to_merge` | Merge PR | Open on GitHub, Refresh |
| `merged` | — | View on GitHub |
| `closed_unmerged` | — | View on GitHub |

## Store Shape

```ts
// Transient, not persisted across sessions
workspacePrInfoById: Record<string, WorkspacePrInfo>;

interface WorkspacePrInfo {
  pr: GitHubPrPayload | null; // null = no PR
  derived: WorkspacePrStatus;
  lastFetched: number;        // epoch-ms
}
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `gh` CLI not installed | `getPrStatus` returns `ok: false`; sidebar shows fallback identity mark |
| `gh auth status` fails | Same as above; no toast spam |
| Network offline | `gh` times out; cached state preserved until next successful fetch |
| PR deleted (404) | `gh pr view` returns "no pull requests found"; status becomes `no_pr` |
| Branch has no remote | `gh pr view` fails; graceful fallback to `no_pr` |

## Future Work (Phase 2+)

- **PR creation → auto-refresh**: After `scm:create-pr` succeeds, immediately fetch status *(done in Phase 1)*
- **Merge queue**: Add `queued_for_merge` status for repos using GitHub merge queues
- **Edit PR**: `gh pr edit` for title/body changes from within Stave
- **Close/Reopen PR**: `gh pr close` / `gh pr reopen`
- **Webhook-based updates**: Replace polling with GitHub webhook push for real-time status
- **Archive workspace on merge**: Prompt user to archive workspace after PR is merged
- **Cross-project PR view**: Aggregate PR status across all recent projects in sidebar

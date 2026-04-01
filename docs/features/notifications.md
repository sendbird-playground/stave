# Notifications

Stave now includes an in-app notification center for background task activity.

## What it does

- records task turn completions across workspaces
- records approval requests with project / workspace / task context
- keeps notification history in SQLite
- can play an optional synthesized success sound when a task turn completes
- tracks read / unread state
- lets you jump from a notification back into the related project, workspace, and task
- lets you approve or deny approval requests directly from the notification center

## UI

- the notification center lives in the top bar behind the bell button
- unread notifications show a badge count
- each notification can be marked as read individually
- unread notifications stay in the main inbox list
- read notifications move out of the inbox and remain visible in a separate history view
- notifications stay readable after the underlying task or workspace is no longer active
- if the linked task is archived, opening the notification still routes to the correct project and workspace, then asks you to restore the task before reopening it
- Settings > General includes task completion sound controls for enable/disable, preset, volume, and preview

## Persistence model

Notifications are stored separately from workspace snapshots in a dedicated SQLite table.

Each record captures:

- notification kind
- frozen title / body text for historical readability
- project path and project name
- workspace id and workspace name
- task id and task title
- turn id and provider id
- optional inline action metadata such as approval request ids
- `created_at` and `read_at`
- a dedupe key for event-safe insertion
- a JSON payload for future audit or analytics work

This keeps notification history durable without coupling it to the mutable workspace snapshot.

## Current event sources

- `task.turn_completed`
  - emitted after the finishing turn has fully cleared the workspace's responding state
  - in practice this matches the point where the workspace sidebar wave indicator disappears
- `task.approval_requested`
  - emitted when a provider requests approval during an active turn

## Why this shape

The notification table is intentionally append-friendly and context-rich so the same records can later feed:

- audit logs
- workspace activity timelines
- per-project or per-workspace statistics
- approval trend analysis

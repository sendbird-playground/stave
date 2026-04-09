# Integrated Terminal

## Summary

- Stave includes a workspace-scoped integrated terminal with terminal tabs in the same top strip as task tabs.
- You can open a terminal for the workspace root or for a specific Explorer path without leaving Stave.

## When To Use It

- Use it when you need a quick shell in the current workspace while keeping chat, editor, and Explorer visible.
- Use it when you want a terminal tab tied to the current workspace instead of opening a separate system terminal window.
- Use the system terminal entry point when you explicitly want an external shell window managed by your OS.

## Before You Start

- Open a project or workspace in Stave first.
- The integrated terminal uses the workspace path as its shell root.

## Quick Start

1. Click the `Terminal` button to show the docked terminal.
2. If no terminal tab exists yet, Stave creates one for the active workspace.
3. Use the terminal tab segment in the top strip to switch, create, rename, or close terminal tabs.

## Interface Walkthrough

### Entry Points

- `Terminal` button in the main workspace chrome toggles the dock visibility.
- `Open in Stave Terminal` in the top bar workspace path menu opens a terminal tab for the current workspace path.
- `Open in Stave Terminal` in the Explorer context menu opens a terminal tab rooted at the selected folder or file parent directory.

### Key Controls

- Task tabs and terminal tabs share the same top strip, but they stay independent.
- Selecting a task tab changes the chat context.
- Selecting a terminal tab opens the dock and focuses that terminal session without changing the active task.
- The dock header shows the active terminal title and, when present, the linked task label.
- The dock header actions clear the visible transcript, hide the dock, or close the active terminal tab.

## Common Workflows

### Create Or Configure Something

1. Click the terminal button in the top strip to create a new terminal tab.
2. Stave uses the active task title when a task is linked, or the current path name when the tab is path-based.
3. Rename a terminal tab from its strip menu when you want a custom label.

### Run Or Verify Something

1. Select the terminal tab you want from the top strip.
2. Run commands in the docked shell.
3. Success looks like streamed shell output in the dock while the rest of the workspace stays interactive.

## Files And Data

- Terminal tab metadata is stored as part of the workspace shell state.
- Terminal transcript cache is best-effort and local to the app.
- Live shell processes are reset when you switch workspaces.

## Limitations And Advanced Options

- The dock shows one active terminal viewport at a time even when multiple terminal tabs exist.
- `Open in Terminal` still opens the external system terminal. It is separate from `Open in Stave Terminal`.
- Terminal tabs persist as workspace state, but live shell processes do not survive a workspace switch.

## Troubleshooting

### Terminal Tab Opens But No Output Appears

- Symptom: the dock opens but the terminal stays blank.
- Cause: the terminal bridge failed to create or connect a session.
- Fix: reopen the terminal tab or restart the desktop app with `bun run dev:desktop` if you are in local development.

### External Terminal Opens Instead Of The Integrated One

- Symptom: a system terminal window opens outside Stave.
- Cause: you used `Open in Terminal`, which keeps the external-terminal behavior.
- Fix: use `Open in Stave Terminal` from the same menu.

## Related Docs

- [Command Palette](command-palette.md)
- [Zen Mode](zen-mode.md)
- [Project / workspace / task shell redesign](../ui/project-workspace-task-shell.md)

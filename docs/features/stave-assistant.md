# Stave Assistant

## Summary

- Stave Assistant is a global chat widget for controlling Stave outside any individual task conversation.
- It can answer product questions, switch projects or workspaces, open panels, update the Information panel, and hand implementation-heavy requests off to task chat.

## When To Use It

- Use it when you want to control Stave itself rather than continue a single task thread.
- Use it for navigation, settings, workspace summaries, and lightweight Information panel updates.
- Use normal task chat when you want code changes, longer terminal work, or an implementation run that should live with task history.

## Before You Start

- Open a project if you want project-aware answers or workspace actions.
- Select a workspace if you want to update the Information panel directly.
- Review `Settings → Assistant` if you want to change the assistant target scope, model routing, or handoff behavior.

## Quick Start

1. Open `Stave Assistant` from the top bar, command palette, or the floating launcher in the lower-right corner.
2. Pick the target scope: `App`, `Current Project`, or `Current Workspace`.
3. Ask a question or give a control command such as `open information`, `switch workspace release`, or `summarize stave`.

## Interface Walkthrough

### Entry Points

- Top bar: `Assistant`
- Command palette: `Open Stave Assistant`
- Floating launcher: `Stave Assistant`
- Settings: `Assistant`

### Key Controls

- Target selector: chooses whether the assistant should reason about the whole app, the current project, or the current workspace by default.
- Composer: sends global questions or commands.
- Settings button: opens `Settings → Assistant`.
- Clear button: clears the assistant conversation without affecting task chat history.
- Stop button: aborts the current assistant turn.

## Common Workflows

### Control Stave

1. Ask for navigation or UI actions such as `open changes`, `show scripts`, `collapse sidebar`, or `open settings`.
2. The assistant applies the action immediately when it can be resolved locally.
3. The widget replies with a short confirmation in the conversation.

### Update Workspace Information

1. Switch the target to `Current Workspace` or select a workspace first.
2. Ask for a direct edit such as `add todo release checklist`, `note update API freeze on Friday`, or paste a Jira / PR / Figma / Slack / Confluence link.
3. The `Information` panel state updates immediately when direct edits are enabled in settings.

### Handoff Complex Work To Task Chat

1. Ask for heavier work such as debugging, code changes, git workflows, or longer implementation.
2. If `Auto Handoff To Task` is enabled, the assistant creates a task and forwards the request there.
3. Continue the implementation inside the created task chat.

## Files And Data

- Assistant UI state is stored in the app store and persisted with the rest of lightweight local UI state.
- Assistant settings live under the main Settings dialog.
- Task handoff still uses normal task history and workspace snapshots.

## Limitations And Advanced Options

- The assistant is optimized for Stave control, not for replacing task chat.
- Some app actions are deterministic and run locally; others still require provider reasoning.
- Complex repository work is intentionally redirected to task chat so execution history stays attached to a task.

## Troubleshooting

### Information Edits Do Not Apply

- Symptom: the assistant answers, but notes or todos do not change.
- Cause: no workspace is selected, or direct Information edits are disabled.
- Fix: select a workspace and check `Settings → Assistant → Direct Information Edits`.

### A Request Creates A Task Instead Of Staying In The Widget

- Symptom: the assistant opens a new task and forwards the request.
- Cause: the router classified the request as implementation-heavy and `Auto Handoff To Task` is enabled.
- Fix: disable `Auto Handoff To Task` in `Settings → Assistant` if you want those requests to stay in the widget.

## Related Docs

- [Command Palette](command-palette.md)
- [Workspace Scripts](workspace-scripts.md)
- [Session Replay](session-replay.md)

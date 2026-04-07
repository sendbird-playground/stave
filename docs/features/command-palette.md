# Command Palette

## Goal

- Provide a global IDE action launcher on `Cmd/Ctrl+Shift+P`.
- Keep slash commands separate as chat-input syntax, not shell-wide actions.
- Make palette actions extensible through a registry instead of hard-coded dialog state.

## UX Model

- `Cmd/Ctrl+Shift+P` opens the global command palette anywhere in the app.
- `Cmd/Ctrl+P` still focuses top-bar file quick open.
- Provider slash-command suggestions in the composer now follow the current caret position instead of only matching the first token in the draft.
- The palette is for executable IDE actions:
  - navigation
  - view toggles
  - task actions
  - provider switching
  - settings entry points
  - external workspace actions
- Slash commands stay in the composer and follow provider-native behavior.

## Default Command Groups

- `Navigation`
  - quick open file
  - go home
  - jump to the latest completed turn task
  - switch task / workspace / project
  - refresh project files / workspaces
- `View`
  - toggle workspace sidebar
  - toggle changes panel
  - show explorer / toggle information
  - toggle editor / terminal
  - enter / exit zen mode
- `Task`
  - new task
  - create PR
  - continue in new workspace
  - save file
  - stop active turn
- `Provider`
  - set provider to Claude, Codex, or Stave Auto
- `Settings`
  - open settings
  - jump to Design, Providers, or Command Palette settings
  - open keyboard shortcuts
- `External`
  - reveal active workspace
  - open active workspace in VS Code or Terminal

## Customisation

Settings → Command Palette supports:

- pinned core commands
- hidden core commands
- recent-command visibility
- clearing recent history

The palette persists recent command IDs and surfaces them in a dedicated `Recent` section when enabled.

## Extension Surface

The palette uses an internal registry exposed through:

```ts
registerCommandPaletteContributor(contributor)
```

Contributors can inject additional commands without coupling to the dialog UI. Core Stave commands, dynamic task/workspace entries, and future contributed commands all use the same presentation and execution pipeline.

## Related Shortcuts

- `Cmd/Ctrl+B` toggles the left workspace sidebar.
- `Cmd/Ctrl+Shift+B` toggles the source control panel.
- `Cmd/Ctrl+E` opens the explorer panel.
- `Cmd/Ctrl+I` toggles the information panel.
- `Cmd/Ctrl+K`, then `Z` toggles Zen mode.
- `Cmd/Ctrl+L` or `Cmd/Ctrl+J` focuses the prompt composer when it is not already focused.
- `Alt+P` opens the prompt model selector from anywhere in the app.
- `Shift+Tab` toggles plan mode from anywhere in the app.

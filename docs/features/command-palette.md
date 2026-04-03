# Command Palette

## Goal

- Provide a global IDE action launcher on `Cmd/Ctrl+Shift+P`.
- Keep slash commands separate as chat-input syntax, not shell-wide actions.
- Make palette actions extensible through a registry instead of hard-coded dialog state.

## UX Model

- `Cmd/Ctrl+Shift+P` opens the global command palette anywhere in the app.
- `Cmd/Ctrl+P` still focuses top-bar file quick open.
- The palette is for executable IDE actions:
  - navigation
  - view toggles
  - task actions
  - provider switching
  - settings entry points
  - external workspace actions
- Slash commands stay in the composer and are configured separately under Settings → Slash Commands.

## Default Command Groups

- `Navigation`
  - quick open file
  - go home
  - switch task / workspace / project
  - refresh project files / workspaces
- `View`
  - toggle workspace sidebar
  - toggle changes panel
  - show explorer / information
  - toggle editor / terminal
- `Task`
  - new task
  - save file
  - stop active turn
- `Provider`
  - set provider to Claude, Codex, or Stave Auto
- `Settings`
  - open settings
  - jump to Design, Providers, Slash Commands, or Command Palette settings
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

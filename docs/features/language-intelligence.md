# Language Intelligence

Stave supports two editor intelligence paths today.

## Built-in Monaco support

TypeScript and JavaScript use Monaco's built-in TypeScript worker plus workspace-loaded `tsconfig.json`, source files, and type libraries.

That path powers:

- module resolution
- diagnostics
- hover
- completion
- go to definition

## Project language servers

Other languages can use an Electron-managed Language Server Protocol runtime.

Current support:

- Python via `pyright-langserver` or `basedpyright-langserver`

The editor settings expose:

- a toggle to enable the LSP runtime
- a Python server command override

When enabled, Stave starts one stdio-backed language-server session per active workspace root and language, then forwards Monaco document sync, hover, completion, definition, and diagnostics through Electron IPC.

## macOS file-system permissions

When a file is opened in the editor, Stave reads workspace source files and TypeScript type definitions from `node_modules` to power IntelliSense. If the project lives inside a macOS-protected folder (`~/Desktop`, `~/Documents`, `~/Downloads`, or iCloud Drive), the OS shows a consent dialog the first time access is attempted.

**Production builds** — the dialog appears once and the grant is stored permanently in the macOS TCC database. No action needed after that first approval.

**Development builds** — the Electron binary is replaced on every rebuild, which invalidates the previous TCC grant and causes the dialog to reappear each session. To suppress it during development, grant permanent access manually:

```
System Settings → Privacy & Security → Files and Folders
→ find Stave (or Electron) and toggle on each folder you work in
```

Alternatively, keep your development workspace outside a protected folder (e.g. directly under `~`) to avoid the TCC check entirely.

## Current limits

- Python support depends on an installed external language server
- the active workspace root is the session boundary
- nested per-package config discovery is not implemented yet
- rename, references, and code actions are not implemented yet

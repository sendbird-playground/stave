# Workspace Automations

## Summary

- Workspace Automations let Stave run workspace actions, long-running services, and lifecycle hooks from the right rail.
- The Automation Manager provides a lightweight GUI for editing shared `actions`, `services`, and `hooks` in `.stave/automations.json` without exposing a raw JSON editor.

## When To Use It

- Use this when a workspace needs repeatable setup commands, dev services, or PR/workspace lifecycle automation.
- Use it when you want teammates to share the same automation entry points through the Stave UI.
- Use manual JSON editing instead when you need custom `targets` or advanced `.stave/automations.local.json` overrides.

## Before You Start

- Open a project in Stave and select a workspace.
- Make sure the workspace has write access to its `.stave/` folder.
- If you need project-wide automation, decide whether the config should live in the repository root or in the active workspace.

## Quick Start

1. Open the right rail and switch to `Automation`.
2. In `Automation Manager`, choose `Project Config` or `Workspace Config`.
3. Add an `Action` or `Service`, fill in the id, target, and commands, then save.
4. Add hook links if the automation should run from `workspace.created`, `workspace.archiving`, `pr.beforeOpen`, or `pr.afterOpen`.
5. Use `Effective Runtime` below the manager to run the entry and verify the merged result for the current workspace.

## Interface Walkthrough

### Entry Points

- Open the right rail and select the `Automation` tab.
- The top card is `Automation Manager`.
- The lower cards under `Effective Runtime` show the merged actions, services, and hooks that Stave will actually run for the active workspace.

### Key Controls

- `Config Scope`: chooses which shared `.stave/automations.json` file the manager edits.
- `Add Action`: creates a short-lived runnable command sequence.
- `Add Service`: creates a long-running process that can be started and stopped from the panel.
- `Hooks`: links actions or services to lifecycle triggers.
- `Save`: writes the selected shared config file.
- `Reload`: re-reads the selected config file from disk.
- `Discard`: throws away unsaved GUI changes and reloads the file.

## Common Workflows

### Create An Action

1. Click `Add Action`.
2. Set a stable `ID` such as `bootstrap` or `test-ci`.
3. Add a label and description if the default generated name is not enough.
4. Choose a `Target`:
   - `Workspace` runs inside the active workspace path.
   - `Project` runs in the repository root.
5. Enter one shell command per line in `Commands`.
6. Save, then run the action from `Effective Runtime`.

### Create A Service

1. Click `Add Service`.
2. Enter the service id and one or more commands.
3. Set `Restart on run` if Stave should replace an existing running process when you run it again.
4. Enable `Use Orbit` when the service should run through `portless` and expose an Orbit URL.
5. Optionally set `Orbit Name`, `Orbit Proxy Port`, or `Plain HTTP` for local routing preferences.
6. Save, then use `Run` / `Stop` from `Effective Runtime` to manage the service.

### Wire A Hook

1. Scroll to `Hooks`.
2. Find the trigger you need.
3. Toggle `Enabled` on the action or service you want linked.
4. Leave `Blocking` on when failures should stop the parent workflow, or turn it off for best-effort execution.
5. Save, then test the hook from the `Hooks` section in `Effective Runtime`.

### Verify The Effective Runtime

1. Save the manager changes.
2. Use the `Refresh` button in `Effective Runtime`.
3. Run the target action, service, or hook.
4. Inspect the live status badge, error message, and log output in the panel.

## Files And Data

- Shared project config: `<project>/.stave/automations.json`
- Shared workspace config: `<workspace>/.stave/automations.json`
- Optional advanced local override: `<project-or-workspace>/.stave/automations.local.json`

Minimal shared config example:

```json
{
  "version": 2,
  "actions": {
    "bootstrap": {
      "label": "Bootstrap",
      "description": "Install dependencies and prepare the workspace.",
      "commands": [
        "bun install",
        "bun run db:prepare"
      ],
      "target": "workspace"
    }
  },
  "services": {
    "app": {
      "commands": [
        "bun run dev"
      ],
      "target": "workspace",
      "orbit": {
        "enabled": true,
        "name": "stave"
      }
    }
  },
  "hooks": {
    "workspace.created": [
      {
        "ref": "bootstrap",
        "kind": "action"
      }
    ]
  }
}
```

## Limitations And Advanced Options

- The GUI edits only shared `.stave/automations.json` files.
- The GUI does not edit `targets`.
- The GUI does not edit `.stave/automations.local.json`.
- Orbit services require `Workspace` as the target.
- If you need custom target definitions, per-developer overrides, or unsupported JSON fields, edit the file manually.
- When both workspace and project shared configs exist, the workspace shared config wins for the active workspace.

## Troubleshooting

### The Manager Shows A File Error

- Symptom: the top card shows invalid JSON or schema errors.
- Cause: the existing config file is not valid `version: 2` automations JSON.
- Fix: correct the file manually, then reload the manager.

### The Runtime View Does Not Change After Saving

- Symptom: `Effective Runtime` still shows older entries.
- Cause: a higher-priority workspace shared config is overriding the project shared config for the current workspace.
- Fix: check the selected `Config Scope`, then refresh `Effective Runtime`.

### A Hook Entry Is Marked As Unresolved

- Symptom: the manager shows preserved unresolved hook refs.
- Cause: a hook references an action or service that is not available in the current merged entry list.
- Fix: restore the missing entry, correct the ref id manually, or remove the unresolved hook link.

## Related Docs

- [Project / workspace / task shell redesign](../ui/project-workspace-task-shell.md)
- [Feature guide authoring](README.md)
- [Feature guide template](../templates/feature-guide-template.md)

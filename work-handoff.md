# Work Handoff

## Objective
Replace the unpublished legacy scripts concept with workspace automations, expose it in the right rail, and clean up the right-side overlay architecture so each panel is independently owned behind a shared shell.

## Active Task Path
tracking/sessions/2026-04-04_workspace-automations/features/workspace-automations/tasks/automation-panel-and-hooks

## Current Status
Handoff

## Completed
- Replaced the old scripts groundwork with the `automations` domain and `.stave/automations.json` config flow.
- Wired main/preload/window API contracts and workspace/PR hook execution.
- Added the Automation panel to the right rail.
- Removed the old top tab bar from `EditorPanel`.
- Added `RightRailPanelShell` and split Explorer, Changes, Information, and Automation into independent right-rail panel modules.
- Aligned right-rail panel ids through `right-rail-panels.ts`, `RightRail.tsx`, `AppShell.tsx`, and `layout.utils.ts`.
- Deleted the obsolete untracked `RUN_SCRIPTS.md`.
- Verified `bun run typecheck` and `bun test tests/workspace-scripts-config.test.ts`.

## Remaining Work
- Run a desktop smoke test for the new right-rail panel layout.
- Validate Automation panel behavior in real workspace/project configs.
- Decide whether spotlight/runtime-target work should be expanded next.

## Recommended Next Actions
- Open the desktop app and verify right-rail switching for Explorer, Changes, Information, and Automation.
- Check that Information panel scrolling and Automation panel refresh/log interactions feel correct in the new shell.
- If UI polish is needed, adjust `RightRailPanelShell` or per-panel spacing rather than putting shared chrome back into `EditorPanel`.

## Nice-to-Have Follow-Ups
- Centralize right-rail panel ids across `layout.utils.ts`, `RightRail.tsx`, and `AppShell.tsx` with `src/lib/right-rail-panels.ts`.
- Add per-panel visibility configuration once product requirements are fixed.

## Open Questions
- Should the right rail eventually support user-configurable panel visibility/order?
- Should spotlight execution become a first-class service/runtime surface beyond the current automation target model?

## Changed Files
- src/components/layout/EditorPanel.tsx
- src/components/layout/RightRailPanelShell.tsx
- src/components/layout/RightRail.tsx
- src/components/layout/WorkspaceExplorerPanel.tsx
- src/components/layout/WorkspaceChangesPanel.tsx
- src/components/layout/WorkspaceInformationPanel.tsx
- src/components/layout/WorkspaceAutomationsPanel.tsx
- src/components/layout/AppShell.tsx
- src/lib/right-rail-panels.ts
- src/store/layout.utils.ts
- tracking/sessions/2026-04-04_workspace-automations/features/workspace-automations/tasks/automation-panel-and-hooks/tasks.md
- tracking/sessions/2026-04-04_workspace-automations/features/workspace-automations/tasks/automation-panel-and-hooks/handoff.md

## Notes
- `Editor` and `Terminal` remain exceptions; only the right-side overlay panels were refactored.
- The shared shell intentionally owns only the panel title and divider. Panel-specific actions remain inside each panel module.

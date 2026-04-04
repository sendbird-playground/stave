# Work Handoff

## Objective
Upgrade Stave's Claude and Codex SDK integrations to the most recent safe versions and adopt the highest-value new SDK features in Stave itself, with end-to-end contract updates, UI exposure where appropriate, and verification.

## Active Task Path
Not set. No `tracking/` task directory exists for this worktree yet.

## Current Status
Plan

## Completed
- Audited current dependency versions in `package.json` and `bun.lock`.
- Verified current Stave integration points for both SDKs.
- Verified upstream current state:
- Claude Agent SDK is behind locally and should move from `0.2.86` to `0.2.92`.
- Codex SDK local `0.118.0` already matches the current stable release line.
- Identified concrete adoption gaps in Stave:
- Codex `approvalPolicy: "on-failure"` is not supported in Stave contracts or UI.
- Codex `TurnOptions.outputSchema` is not used anywhere.
- Claude `startup()` prewarm is not used.
- Claude session/subagent inspection APIs are not exposed through IPC.
- Found stale Codex version copy in settings UI: `0.117.0` text is outdated.

## Remaining Work
- Bump `@anthropic-ai/claude-agent-sdk` to `0.2.92` and refresh lockfile.
- Keep `@openai/codex-sdk` on `0.118.0` unless the user explicitly wants prerelease `0.119.0-alpha.8`.
- Add Codex `on-failure` approval policy support across runtime types, Zod schema, normalization, settings, UI, and tests.
- Add Claude `startup()` prewarm in the main Claude runtime and inline completion path.
- Update stale docs and UI copy for Codex supported baseline.
- Run `bun run typecheck` and `bun test`.

## Recommended Next Actions
1. Update dependencies:
   - `bun add @anthropic-ai/claude-agent-sdk@0.2.92`
   - Keep `@openai/codex-sdk@0.118.0`
2. Implement Codex approval policy upgrade end-to-end in:
   - `src/lib/providers/provider.types.ts`
   - `electron/main/ipc/schemas.ts`
   - `src/lib/providers/runtime-option-contract.ts`
   - `src/lib/providers/codex-runtime-options.ts`
   - `src/store/provider-runtime-options.ts`
   - `src/store/app.store.ts`
   - `src/components/layout/settings-dialog-providers-section.tsx`
   - `src/components/session/ChatInput.tsx`
   - `tests/codex-sdk-runtime.test.ts`
3. Update `electron/providers/codex-sdk-runtime.ts` so `resolveApprovalPolicy(...)` accepts `"on-failure"` and passes it through to the SDK.
4. Add Claude prewarm support:
   - `electron/providers/claude-sdk-runtime.ts`
   - `electron/providers/inline-completion.ts`
   Approach:
   - dynamically import SDK `startup()`
   - cache prewarm promise per resolved Claude executable path
   - call it before first `query()` in runtime and inline completion
5. Update docs and stale copy:
   - `src/components/layout/settings-dialog-developer-section.tsx`
   - `docs/providers/provider-runtimes.md`
6. If time remains, do a second pass for higher-value adoption:
   - expose Claude `listSessions()`, `getSessionMessages()`, `listSubagents()`, `getSubagentMessages()` through provider IPC
   - surface them in the developer section rather than leaving them runtime-only

## Nice-to-Have Follow-Ups
- Adopt Codex `TurnOptions.outputSchema` for internal structured tasks like task naming, commit message generation, PR description generation, or plan extraction.
- Expose Claude `terminal_reason` separately in Stave diagnostics instead of only relying on `stop_reason`.
- Evaluate whether Codex `additionalDirectories` and `webSearchEnabled` are worth adding to runtime options.

## Open Questions
- Should Codex stay on stable `0.118.0`, or does the user want the prerelease line `0.119.0-alpha.8`?
- Is Claude session/subagent inspection part of the required scope now, or should it be deferred after the minimal upgrade lands?
- Should `outputSchema` adoption be included in this task or split into a follow-up?

## Changed Files
- `work-handoff.md`

## Notes
- Current local versions:
  - `@anthropic-ai/claude-agent-sdk`: `0.2.86`
  - `@openai/codex-sdk`: `0.118.0`
- Current stable recommendation:
  - Claude: `0.2.92`
  - Codex: `0.118.0`
- Existing Stave support already present and should not be regressed:
  - Claude `getContextUsage()`
  - Claude `reloadPlugins()`
  - Claude task budget and agent progress summaries
  - Codex reasoning summary controls
  - Codex experimental plan mode
- Stale copy to fix:
  - `src/components/layout/settings-dialog-developer-section.tsx` still says Codex baseline `0.117.0`
- Source references used for the audit:
  - Anthropic changelog: `https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md`
  - Anthropic migration guide: `https://docs.claude.com/en/docs/claude-code/sdk/migration-guide`
  - OpenAI Codex releases: `https://github.com/openai/codex/releases`
  - OpenAI Codex thread options: `https://github.com/openai/codex/blob/main/sdk/typescript/src/threadOptions.ts`
  - OpenAI Codex turn options: `https://github.com/openai/codex/blob/main/sdk/typescript/src/turnOptions.ts`

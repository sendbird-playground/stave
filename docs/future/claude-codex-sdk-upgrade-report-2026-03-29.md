# Claude and Codex SDK Upgrade Report

Date: 2026-03-29

## Scope

- Upgrade `@anthropic-ai/claude-agent-sdk` from `0.2.83` to `0.2.86`
- Upgrade `@openai/codex-sdk` from `0.116.0` to `0.117.0`
- Check what can be reflected in Stave immediately versus what should stay deferred

## Applied now

- Bumped both SDK dependencies in `package.json` and `bun.lock`
- Updated Stave's Codex supported-version constants and docs to `0.117.0`
- Added `gpt-5.4-mini` to the Stave Codex model catalog
- Reflected `gpt-5.4-mini` into the Stave Auto `codex-only` preset for lightweight Codex-only roles
- Removed Codex approval policy `on-failure` from the Stave runtime/UI surface
- Added Claude `taskBudget` as a Stave runtime setting (`Task Budget (Tokens)`)
- Added Claude `settingSources` as an explicit Stave runtime setting
- Added Claude `getContextUsage()` and `reloadPlugins()` developer tools to Stave
- Wired Claude plugin reload to refresh the native command-catalog path in Stave

## Findings

### Codex SDK `0.116.0` -> `0.117.0`

- Public TypeScript SDK surface is unchanged for the parts Stave uses:
  - `Codex`
  - `Thread`
  - `ThreadEvent`
  - `runStreamed()`
  - `startThread()` / `resumeThread()`
  - thread options such as `model`, `sandboxMode`, `networkAccessEnabled`, `modelReasoningEffort`, `webSearchMode`, `approvalPolicy`
- Result: this upgrade is low risk for Stave's current Electron runtime integration.

Codex documentation reviewed on 2026-03-29 shows:

- Recommended models: `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`
- `gpt-5.3-codex-spark` exists, but is described as a research preview model
- `approval_policy = "on-failure"` is deprecated in Codex config docs, so Stave now normalizes any legacy value to `on-request`

### Claude Agent SDK `0.2.83` -> `0.2.86`

- Stave's current `query()`-based integration still matches the public SDK surface it uses:
  - `query()`
  - `Query`
  - `supportedCommands()`
  - streaming message handling
  - `pathToClaudeCodeExecutable`
  - `agentProgressSummaries`
- Result: the dependency upgrade itself is low risk.

New public SDK capabilities observed between the reviewed versions:

- `taskBudget` option on query settings
- `getContextUsage()` control helper
- `reloadPlugins()` control helper
- new `TaskCreated` hook event

These are additive, not breaking, for Stave, and this follow-up reflects all of them in product surface:

- `taskBudget`
  - Exposed as `Task Budget (Tokens)` in Stave settings
  - Sent through store -> IPC schema -> Electron runtime -> Claude SDK query options

- `getContextUsage()`
  - Exposed in Developer settings as a workspace/session diagnostics action
  - Returns token-pressure breakdown for currently active Claude runtime context

- `reloadPlugins()`
  - Exposed in Developer settings as a Claude runtime action
  - Plugin reload now triggers Stave-side Claude command catalog refresh

- `settingSources`
  - Exposed as an explicit Stave setting
  - Default Stave configuration now loads `project`
  - `local` and `user` remain explicit toggles

## Recommended next steps

1. Monitor whether defaulting Claude `settingSources` to `project` changes command/tool expectations in existing workspaces.
2. Decide whether Claude `TaskCreated` hook events should be surfaced as first-class Stave provider events.
3. Keep `gpt-5.3-codex-spark` out of the default verified model list until Stave decides how to handle research-preview models.

## Sources reviewed

- OpenAI Codex SDK docs: `https://developers.openai.com/codex/sdk`
- OpenAI Codex models docs: `https://developers.openai.com/codex/models`
- OpenAI Codex config reference: `https://developers.openai.com/codex/config-reference`
- OpenAI API models docs: `https://developers.openai.com/api/docs/models`
- Anthropic Agent SDK overview: `https://platform.claude.com/docs/en/agent-sdk/overview`
- Anthropic Agent SDK migration guide: `https://platform.claude.com/docs/en/agent-sdk/migration-guide`
- Published package metadata and type definitions for:
  - `@openai/codex-sdk@0.116.0`
  - `@openai/codex-sdk@0.117.0`
  - `@anthropic-ai/claude-agent-sdk@0.2.83`
  - `@anthropic-ai/claude-agent-sdk@0.2.86`

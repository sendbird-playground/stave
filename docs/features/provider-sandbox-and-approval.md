# Provider Sandbox And Approval Guide

## Summary

- Stave exposes separate runtime safety controls for Claude and Codex.
- Use this guide to choose the right combination for review-only work, normal edits, planning, or higher-autonomy automation.
- While a turn is running, the composer can stage one follow-up prompt per task and auto-send it when that task becomes idle again.

## When To Use It

- You want to limit whether a turn can edit files, use the network, or stop for approval.
- You switch between Claude and Codex and want comparable safety levels.
- You use Stave Auto and need to understand what happens when the routed turn lands on Codex plan mode.

## Before You Start

- Claude controls affect `claude-code` turns and Claude-backed Stave Auto turns.
- Codex controls affect `codex` turns and Codex-backed Stave Auto turns.
- The composer runtime chips under the prompt box show the effective settings for the next turn.
- When a turn pauses for approval, the composer queue supports `Enter` to approve the newest request and `Tab` to draft a follow-up instruction that denies the current request and stages the next turn.
- When a turn is actively running, the composer stays editable and the primary action switches to `Queue next`. Stave keeps a single queued follow-up per task, and submitting again replaces that queued payload.
- If you need strict no-write behavior, Codex exposes an explicit `read-only` mode. Claude does not expose an equivalent read/write scope selector in Stave.

## Quick Start

1. Open **Settings → Providers**.
2. Open the **Claude** tab for Claude runtime controls, or the **Codex** tab for Codex runtime controls.
3. Under **Claude Runtime Controls**, pick a `Mode Preset` first, then fine-tune individual fields only if needed.
4. Under **Codex Runtime Controls**, pick a `Mode Preset` first, then fine-tune individual fields only if needed.
5. Check the provider mode pill next to the model selector and the runtime drawer in the composer before sending the turn.

Recommended starting points:

- `Manual`: guarded review-style work. Claude uses `acceptEdits` + sandbox on + unsandboxed off; Codex uses `read-only` + `on-request` + network off.
- `Guided`: recommended day-to-day default. Claude uses `auto` + unsandboxed allowed; Codex uses `workspace-write` + `untrusted` + cached web search.
- `Auto`: trusted local automation. Claude uses `bypassPermissions`; Codex uses `danger-full-access` + `never` + live web search.
- Planning only: keep the base preset you want, then use the composer `Plan` toggle when you need a planning turn. For Codex, plan still forces `read-only` + `never`.

## Interface Walkthrough

### Entry Points

- **Settings → Providers → Claude Runtime Controls**
- **Settings → Providers → Codex Runtime Controls**
- **Settings → Developer → Provider Timeout**
- The provider mode pill beside the model selector, which shows whether the current provider config is `Manual`, `Guided`, `Auto`, or `Custom`
- The composer `Runtime` drawer, which shows the effective file access, approval, network, and plan state before send
- The composer-side `Approval Queue`, which appears above the prompt box when a turn is waiting for one or more approval decisions
- The composer-side `Guide Instead` action, which rejects the latest approval request and stages your next instruction in the composer
- The composer-side queued follow-up banner, which appears while a running turn already has a staged `Queue next` prompt and previews the queued text
- The composer plan toggle switches Claude turns into `Permission Mode = plan`
- The composer plan toggle enables Codex planning for the current draft turn, backed by native App Server plan items

### Key Controls

| Provider | Control | What it changes | Good default |
|---|---|---|---|
| Claude | `Permission Mode` | Main autonomy dial for Claude turns | `auto` or `acceptEdits` |
| Claude | `Dangerous Skip Permissions` | Skips permission prompts more aggressively when `bypassPermissions` is active | `Off` |
| Claude | `Sandbox Enabled` | Requests Claude tool execution inside its sandbox path | `On` for guarded work |
| Claude | `Allow Unsandboxed Commands` | Lets Claude fall back to commands outside the sandbox when sandboxed execution cannot proceed | `Off` unless you intentionally want looser fallbacks |
| Codex | `File Access` | Sets disk access scope directly | `workspace-write` for normal work, `read-only` for inspection |
| Codex | `Approvals` | Controls when Codex pauses before acting | `untrusted` |
| Codex | `Network Access` | Allows or blocks network use | `Off` unless needed |
| Codex | `Web Search` | Chooses whether Codex should stay local, use cached search, or use live search | `cached` |
| Codex | Composer `Plan` toggle | Enables plan mode for the turn | `Off` unless you want planning-only behavior |

Provider differences that matter in practice:

- Claude gives you a sandbox toggle plus a sandbox-escape toggle.
- Codex gives you an explicit file-access scope: `read-only`, `workspace-write`, or `danger-full-access`.
- Codex approval is a separate axis from file access. Claude autonomy is more concentrated in `Permission Mode`.

## Common Workflows

### Create Or Configure Something

1. Pick the outcome first: inspect only, edit inside the repo, or run with high autonomy.
2. If you need explicit no-write behavior, prefer Codex `read-only`.
3. If you want Claude to stay contained, use `Sandbox Enabled = On` and `Allow Unsandboxed Commands = Off`.
4. If you want the App Server-style low-friction baseline, use `Approvals = untrusted` and keep `Network Access = Off` until the task needs it.
5. If you want planning only, use Claude `plan` or the Codex composer plan toggle.

### Run Or Verify Something

1. Confirm the provider mode pill and runtime drawer in the composer match the intended settings.
2. Send a harmless prompt such as “summarize repo status” or “list likely files to inspect first.”
3. If the turn pauses for approval, use the composer `Approval Queue` to approve or deny without reopening the message trace, or use the notification center if you are working elsewhere in the app.
4. If the request should be rejected but you already know the next instruction, press `Tab` or choose `Guide Instead` in the queue. Stave denies that approval and stages your follow-up prompt for the next turn.
5. If the turn is still running but you already know the follow-up, keep typing and choose `Queue next`. Stave stores that next prompt on the task, shows the queued prompt preview in the composer, and auto-sends it when the running turn fully finishes.
6. Success looks like the runtime drawer reflecting the expected state before send. For Codex planning, look for `Planning: On` and an effective `Files: Read Only`. For Claude turns, look for `Sandbox: Enabled/Disabled` and `Unsandboxed: On/Off`.

## Files And Data

- These settings live in Stave application settings, not in your repository files.
- The current Claude default preset is `Guided`, which maps to `Permission Mode = auto`, `Sandbox Enabled = false`, and `Allow Unsandboxed Commands = true`.
- The current Codex defaults are `File Access = workspace-write`, `Approvals = untrusted`, `Network Access = Off`, `Web Search = cached`, and `Planning = Off`.

```json
{
  "claudePermissionMode": "acceptEdits",
  "claudeSandboxEnabled": true,
  "claudeAllowUnsandboxedCommands": false,
  "codexFileAccess": "workspace-write",
  "codexApprovalPolicy": "untrusted",
  "codexNetworkAccess": false,
  "codexWebSearch": "cached",
  "codexPlanMode": false
}
```

## Limitations And Advanced Options

- Claude in Stave does not expose a Codex-style `read-only` / `workspace-write` / `danger-full-access` selector.
- `Dangerous Skip Permissions` is only meaningful when Claude is already in `bypassPermissions`.
- Codex plan mode rewrites the effective runtime for that turn to `read-only` + `never`, regardless of the normal Codex settings.
- Claude SDK has deeper sandbox settings internally, but Stave currently supports the user-facing controls documented here.
- `Custom` appears automatically when you mix fields in Settings so the combination no longer matches one of the built-in presets.
- `Guide Instead` is a Stave-side workflow convenience. It does not inject extra text into the already-paused provider approval request; it rejects that request and prepares the next user turn.
- `Queue next` is intentionally single-slot. Queuing another follow-up before the current turn finishes replaces the already-staged one for that task.

## Troubleshooting

### Codex Still Shows Read Only

- Symptom: the composer shows `Files: Read Only` even though you chose `workspace-write` or `danger-full-access`.
- Cause: Codex plan mode is enabled for the draft turn, or Stave Auto routed a plan turn into Codex.
- Fix: turn off the Codex composer plan toggle, or switch the task out of plan mode before sending.

### Claude Refuses A Command In Sandbox

- Symptom: Claude stops or refuses a command that needs broader access.
- Cause: `Sandbox Enabled` is on and `Allow Unsandboxed Commands` is off, so Stave will not allow sandbox escape fallbacks.
- Fix: keep the safer setting for review-style work, or enable `Allow Unsandboxed Commands` only if you trust the task and want looser fallbacks.

### My Follow-Up Prompt Did Not Send Immediately

- Symptom: you pressed `Queue next`, but nothing new started right away.
- Cause: queued follow-ups only dispatch after the current task is fully idle. If the turn is still streaming, or paused on approval / user-input, Stave keeps the queued prompt staged.
- Fix: let the running turn finish or resolve the blocking approval / user-input request first. You can still edit or clear the staged follow-up while it waits.

### I Need A Strict No-Write Claude Mode

- Symptom: you want Claude to inspect only and never mutate files.
- Cause: Stave does not expose a Codex-style explicit read-only scope for Claude.
- Fix: use Codex `read-only` for strict inspection tasks, or keep Claude sandboxed with unsandboxed fallbacks off when you only need a more guarded Claude path.

## Related Docs

- [Provider Runtimes](../providers/provider-runtimes.md)
- [Stave Model Router](stave-model-router.md)
- [Install Guide](../install-guide.md)

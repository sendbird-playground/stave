# Coliseum — Compare Models Side-By-Side

<!-- Screenshot: the arena split view showing 3 branches streaming different models in parallel.
     Capture steps: open any task, click the "Coliseum" button above the composer,
     pick 3 entrants (Claude + Codex + Stave), send a short prompt, wait for all
     three columns to stream, then screenshot the full session area. Save as
     docs/screenshots/coliseum-arena.png (see "Capturing screenshots" at bottom). -->

![Coliseum arena with three models answering the same prompt in parallel](../screenshots/coliseum-arena.png)

Run the same prompt across 2–4 models at once, watch their answers stream side by side, and promote one winner into your task history.

## Summary

- Coliseum is Stave's **multi-model parallel execution** feature.
- You pick 2–4 `(provider, model)` entrants, send one prompt, and Stave streams all answers into a horizontal split view.
- You then **pick a champion** to keep, or **dismiss the arena** to throw all answers away. The losing branches are cleaned up automatically — they never touch your task's canonical history.

## When To Use It

Use Coliseum when:

- You want to compare how **different models** handle the same problem before committing their output to the task.
- You are unsure whether **Claude** or **Codex** (or a specific variant like Opus vs Sonnet, or GPT‑5.4 vs GPT‑5.4‑mini) will do better on a tricky prompt.
- You are **evaluating** a new model, effort level, or mode preset against your current default.
- You are writing **release notes, copy, summaries**, or anything where you want to cherry-pick the best of several drafts.

Skip Coliseum when:

- You already know which model you want — a single-model chat is faster and cheaper.
- The task has a **pending approval or a running turn** — Coliseum requires a quiet parent turn before it can fan out.
- You are inside a branch of another Coliseum — nested arenas are blocked on purpose.

## Before You Start

- You need **at least one configured provider** (Claude Code, Codex, or Stave router). Coliseum picks from whichever providers you already have working.
- Each entrant runs as a real provider session behind the scenes, so expect **N× the tokens and N× the API cost** of a single turn.
- The parent task must not be **managed by an external controller** (e.g. an active Stave Muse or MCP handoff).

## Quick Start

1. Open any task. The **Coliseum** button lives in a slim strip right above the chat composer.

   <!-- Screenshot: the launcher strip with the "Coliseum" button visible.
        Capture at docs/screenshots/coliseum-launcher-button.png -->

   ![Coliseum launcher button above the composer](../screenshots/coliseum-launcher-button.png)

2. Click **Coliseum** to open the launcher dialog. The dialog starts with **two entrants** pre-filled (one Claude, one Codex).

   <!-- Screenshot: the launcher dialog with two default entrants + prompt textarea + Start button.
        Capture at docs/screenshots/coliseum-launcher-dialog.png -->

   ![Coliseum launcher dialog](../screenshots/coliseum-launcher-dialog.png)

3. Adjust the lineup:
   - **Add entrant** (up to 4) or remove rows with the trash icon.
   - Each row has a **provider dropdown** and a **model dropdown**. Picking a provider auto-selects its default model.
4. Type your prompt in the **Prompt** box.
5. Click **Start Coliseum**.

The session area swaps to the arena view: one column per entrant, all streaming in parallel.

## Interface Walkthrough

### Entry Point

- The launcher button appears in the footer strip above the composer whenever an active task is selected and no turn is running.
- The button is **disabled during an active turn** (tooltip: *"Wait for the current turn to finish before starting a Coliseum"*). Wait for the turn to finish or stop it manually, then try again.

### Launcher Dialog

- **Entrant rows** — each row is one `(provider, model)` pair that will receive the prompt.
- **Provider dropdown** — Claude Code / Codex / Stave (router). Changing the provider resets the model to that provider's default.
- **Model dropdown** — shows every model the selected provider exposes (Opus, Sonnet, Haiku, GPT‑5.4, GPT‑5.4‑mini, Stave auto, …).
- **Add entrant** — adds one more row up to a maximum of **4**.
- **Trash icon** — removes a row. You cannot drop below **2** rows (there is no contest with a single entrant).
- **Prompt** — the single prompt every entrant will run. Same text, same attachments, same mode preset for all rows.
- **Start Coliseum** — disabled until every row has a provider + model, the prompt is non-empty, and every selected provider is available.

### Arena Split View

Once you start the arena, the normal chat panel is replaced by a horizontal split:

- **Top bar** — shows entrant count and a **Dismiss** button. Dismiss discards the whole arena without keeping any answer.
- **Columns** — one per entrant, left-to-right in the order you configured them. Columns are resizable: drag the dividers between them.
- **Column header** — shows the model icon, model name, streaming wave indicator while the answer is still arriving, and the column's position (e.g. `2 / 3`).
- **Pick champion** button — promotes this column's answer into the task's canonical history and closes the arena.
- **Close this branch (×)** button — drops just this column. The arena collapses to a single-model chat if fewer than 2 branches would remain.
- **Prompt card** — each column shows the shared prompt at the top so you can compare answers without scrolling back up.
- **Answer stream** — the full assistant trace (thinking / tool calls / final answer) for that branch, same rendering you see in the normal chat view.

## Common Workflows

### Run A Coliseum And Promote A Winner

1. Open a task, click **Coliseum**, pick 2–4 entrants, type a prompt, click **Start Coliseum**.
2. Wait for at least the column you care about to finish streaming. (Other columns keep streaming independently.)
3. Click **Pick champion** on the winning column.
4. The arena closes, the champion's response is grafted onto the task's message history, and all other branches (including their provider sessions) are cleaned up.
5. Continue the conversation as usual — the champion's `providerSession` becomes the task's new session, so the next turn resumes from the winner's context.

### Throw Everything Away

- Click **Dismiss** in the arena top bar.
- No answer is promoted; every branch is cleaned up; the task returns to the state it had **before** the arena started.

### Drop A Losing Column Early

- Click the **×** button in a column's header.
- The column's runtime is aborted and its branch task is removed.
- If only one entrant would remain after the removal, the whole arena is dismissed automatically (a single-model race is not a Coliseum).

### Restart With A Different Lineup

- After you promote or dismiss, click **Coliseum** again on the same task. The dialog re-opens with default entrants and an empty prompt.

## How It Works (Short Version)

- Each entrant runs as a real, ephemeral **child task** linked to the parent via `coliseumParentTaskId`.
- Branches inherit the parent's **runtime overrides** (permission mode, plan mode, effort) so every entrant runs under the same mode preset as the parent — the only difference between branches is the model.
- Branch tasks are **hidden from task tabs, sidebar previews, and the command palette** — they only exist in the arena.
- When you promote a champion, Stave appends **only the post-fan-out tail** of the champion's messages to the parent's history, rewriting the IDs so the graft is seamless.
- When you dismiss, close a branch, or reload a workspace, any remaining branch tasks are **reaped** so they never clutter the task tree.

Full architecture detail lives in `docs/architecture/` alongside the other runtime docs. This guide stays user-facing.

## Limitations And Advanced Options

- **Entrant count**: 2 (minimum) to 4 (maximum). The upper bound keeps the horizontal split readable on typical laptop widths; higher fan-outs turn into eye strain.
- **No duplicate prompt replay**: the prompt runs once per branch. If you want to *re-run* the same lineup with a different prompt, dismiss and start a new Coliseum.
- **No branch-level edits**: you cannot send follow-up messages into individual branches. The arena is one round — pick a champion, then continue in the parent task.
- **Shared attachments**: attachments and file contexts are copied into each branch's first user message verbatim. They are not re-read per branch.
- **Cost**: each branch is a real provider turn. Running 4 Opus entrants costs 4× an Opus turn. Prefer `stave-auto` or smaller models when exploring.
- **Managed tasks**: Coliseum is blocked on externally-managed tasks (tasks under an MCP controller or Stave Muse lease). Take over the task first if you need to fan out.

## Troubleshooting

### The **Coliseum** button is missing

- Symptom: no button appears above the chat composer.
- Cause: either no task is active, or the task is still hydrating.
- Fix: create or select a task first. If the button still does not show after the message list loads, reopen the workspace.

### The **Coliseum** button is disabled

- Symptom: tooltip says *"Wait for the current turn to finish before starting a Coliseum"*.
- Cause: the parent task has a streaming turn.
- Fix: wait for the turn to finish, or press **Stop** in the composer, then click Coliseum again.

### **Start Coliseum** stays disabled

- Symptom: validation hint under the rows ("Pick at least 2 models…" / "Every entrant needs a provider and a model." / "One or more selected providers are unavailable.").
- Cause: missing provider/model, unavailable provider, or an empty prompt.
- Fix: ensure every row has a provider + model, the prompt is non-empty, and each selected provider is reachable (check provider availability in the composer's provider bar).

### One column never produces an answer

- Symptom: the column keeps showing *"Waiting for response…"* with a streaming indicator that never turns into text.
- Cause: that specific provider/model errored or is rate-limited. Its branch may have failed silently.
- Fix: use the column's **×** button to close the failed branch. The arena keeps running for the remaining entrants. If this repeats, check the provider's status and try a different model.

### A persistent branch task shows up in my task list

- Symptom: a task prefixed or duplicated from the parent's title appears in the task tabs.
- Cause: branch tasks are normally hidden, but a bug or persistence edge case left one un-reaped.
- Fix: reload the workspace. The orphan reaper runs on workspace load and drops any branch that has no live Coliseum group.

## Keyboard Shortcuts

- `Esc` — close the launcher dialog without starting a Coliseum.
- `Tab` / `Shift+Tab` — move focus between entrant controls, prompt, and the Start button.
- The arena itself does not have custom shortcuts yet. Use the column buttons for promotion, closing a branch, or dismissing the arena.

## Files And Data

User-visible state:

- **Parent task** — unchanged until you promote a champion. No new messages are written to the parent during a Coliseum.
- **Branch tasks** — ephemeral; live only in runtime memory and the workspace's session cache. Not persisted across workspace reloads.
- **Champion graft** — when you promote, the post-fan-out messages from the champion are appended to the parent's persisted message history. From the user's perspective it looks exactly like a normal turn response.

## Capturing Screenshots

The guide references three images that need to be captured manually:

| File | What to capture |
|---|---|
| `docs/screenshots/coliseum-launcher-button.png` | Chat composer with the **Coliseum** launcher strip visible above it. |
| `docs/screenshots/coliseum-launcher-dialog.png` | The launcher dialog with 2–3 entrants configured and a prompt typed in. |
| `docs/screenshots/coliseum-arena.png` | The arena split view with 2–3 columns streaming different models. |

To capture:

1. `bun run dev` and open a workspace.
2. Select a task with no active turn.
3. Screenshot the launcher strip (**coliseum-launcher-button.png**).
4. Click **Coliseum**, screenshot the dialog with a short demo prompt typed in (**coliseum-launcher-dialog.png**).
5. Click **Start Coliseum**. Once all columns are streaming or finished, screenshot the full session area (**coliseum-arena.png**).
6. Crop tightly to the relevant surface, avoid private prompt content or personal paths.

## Related Docs

- [Provider Sandbox and Approval](provider-sandbox-and-approval.md) — the mode presets Coliseum inherits from the parent task.
- [Stave Model Router](stave-model-router.md) — use `stave-auto` as a lightweight entrant when you are not sure which model to pick.
- [Attachments](attachments.md) — how file and image context is attached to the shared prompt.

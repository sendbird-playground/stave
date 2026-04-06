# Local MCP User Guide

This guide explains how a packaged Stave desktop user can expose the built-in local MCP server to same-machine tools such as `agentize`.

## Who This Is For

Use this when:

- Stave is installed as a desktop app
- the bot and Stave run on the same machine
- you want the bot to create workspaces, run tasks, and answer approvals through Stave

This is not a remote internet-facing setup. Stave's embedded server is loopback-only, and the app also publishes a companion stdio proxy path for hosts that cannot reach `127.0.0.1` directly.

## What Stave Exposes

When Local MCP is enabled, Stave exposes:

- a localhost MCP endpoint for same-machine clients that can reach loopback directly
- a stdio proxy script for clients such as Codex exec hosts that need a subprocess transport instead of direct loopback HTTP

Both transports provide the same tools and task flows:

- register a project in Stave
- create a git-worktree workspace
- run a task prompt in that workspace
- read task status and turn events
- answer approval and user-input requests

When Lens is open in a workspace, the same Local MCP server also exposes optional `stave_lens_*` inspection tools for that workspace browser session. Use those when an external agent needs screenshots, DOM, console logs, network logs, or element-level inspection from the live page.

## Open The Settings

In Stave:

1. Open `Settings`
2. Go to `Providers`
3. Open the `Stave` tab
4. Find the `Local MCP Server` card
5. Use the separate `Local MCP Request Log` card when you want inbound MCP request visibility

You can manage:

- `Server`: turn the local MCP server on or off
- `Port`: use `0` for automatic port selection, or set a fixed localhost port
- `Token`: the Bearer token required by local clients
- `Rotate`: immediately replace the token and restart the server
- `Local MCP Request Log`: inspect recent inbound `/mcp` requests with paginated browsing, latest-page auto-refresh, response codes, timings, and on-demand sanitized payload loading

Every change is applied by restarting the local MCP server inside the app.

## Connection Info

When the server is running, the Settings card shows:

- `MCP URL`
- `Health URL`
- `Config file`
- one or more `Manifest` paths

Stave also writes a machine-readable manifest for local tools:

- `~/.stave/local-mcp.json`
- `<Stave userData>/stave-local-mcp.json`

The manifest includes:

- `url` and `token` for loopback HTTP clients
- `stdioProxyScript` for subprocess-based clients that should launch `node <stdioProxyScript>`

## Typical `agentize` Flow

1. Start Stave
2. Enable `Local MCP Server` in Settings if needed
3. Let `agentize` read `~/.stave/local-mcp.json`
4. Choose the transport:
   - if the host can reach loopback HTTP directly, connect to the manifest `url` with `Authorization: Bearer <token>`
   - if the host cannot reach `127.0.0.1` directly, launch `node <stdioProxyScript>` and use it as the MCP stdio server
5. Call tools in this order:
   - `stave_register_project`
   - `stave_create_workspace`
   - `stave_run_task`
   - `stave_get_task` or `stave_list_turn_events`
   - `stave_respond_approval` or `stave_respond_user_input` when needed

If the workflow also needs live UI inspection:

6. Open Lens inside the same workspace in Stave
7. Call `stave_lens_navigate`, `stave_lens_screenshot`, `stave_lens_get_html`, or the other `stave_lens_*` tools as needed

## Example Manifest

```json
{
  "version": 1,
  "name": "stave-local-mcp",
  "mode": "local-only",
  "url": "http://127.0.0.1:43127/mcp",
  "healthUrl": "http://127.0.0.1:43127/health",
  "token": "your-token-here",
  "stdioProxyScript": "/Applications/Stave.app/Contents/Resources/app.asar.unpacked/out/main/stave-mcp-stdio-proxy.mjs"
}
```

## Managed Monitoring In Stave

When a task is started through Local MCP, Stave marks it as a `Managed` task.

- while the external turn is active, Stave polls the latest persisted task state
- the desktop UI becomes monitor-only for that task
- chat input, approval responses, user-input responses, and other task mutations stay disabled until you explicitly take over
- once the external turn finishes, you can use `Take Over` in the task header to convert the task back into a normal interactive Stave task

This keeps one clear control owner at a time and avoids mixed local/external edits during the same run.

## Approval And User Input

If the running task asks for confirmation or structured answers:

- poll task state with `stave_get_task`
- inspect turn events with `stave_list_turn_events`
- answer using `stave_respond_approval` or `stave_respond_user_input`
- Stave shows these requests for visibility, but managed tasks expect the originating client to answer them

Use `Local MCP Request Log` in `Settings → Providers → Stave` when you need transport-level request visibility. The latest page auto-refreshes while older pages stay stable for pagination.

These responses continue the same Stave turn. They do not create a new task.

## Security Notes

- the server binds to `127.0.0.1`
- it is intended for same-user, same-machine automation only
- anyone with the token can act as a local MCP client
- rotate the token if you suspect local exposure
- disable the server when you are not using it

## Troubleshooting

### The bot cannot connect

- confirm Stave is running
- confirm `Local MCP Server` is enabled
- check `Local MCP Request Log` for recent inbound requests and response codes
- confirm the bot is using the current token
- confirm the bot is using the current manifest URL after any restart or token rotation
- if the bot runs in a sandbox or host that cannot reach `127.0.0.1`, switch it to `node <stdioProxyScript>` instead of direct HTTP

### The port changes between launches

`Port = 0` means Stave chooses any available port. Set a fixed port in Settings if your local tool wants a stable one.

### The bot gets `401 Unauthorized`

The token is wrong or stale. Copy the token again from Settings or rotate it and refresh the bot-side manifest cache.

### The UI and bot seem out of sync

Managed tasks poll persisted state while the external turn is active. If a finished task still looks read-only, use `Take Over` in the task header.

### Lens tools say no browser session exists

- open the `Lens` panel inside the target workspace first
- make sure the external agent is using the same workspace ID
- retry the `stave_lens_*` call after the panel is visible

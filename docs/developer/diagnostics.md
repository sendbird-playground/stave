# Developer Diagnostics

## Render profiler

Stave includes an opt-in React render profiler around the main hot UI surfaces:

- `ProjectWorkspaceSidebar`
- `ChatPanel`
- `ChatInput`
- `EditorPanel`
- `EditorMainPanel`

Enable it in a renderer session with either:

```text
http://127.0.0.1:5173/?staveProfileRenders=1
```

or from DevTools:

```js
localStorage.setItem("stave:render-profiler", "1");
location.reload();
```

When enabled, slow commits are logged to the console and recorded as `performance.measure(...)` entries prefixed with `stave:render:`.

## Settings diagnostics

The Settings dialog includes desktop-only diagnostics for renderer and compositor troubleshooting:

- `Tooling` shows current workspace sync state against `origin/main` and the native shell / CLI auth status Stave depends on (`git`, `gh`, `claude`, `codex`)
- `Session Replay UI` toggles the replay entry point for the active chat session
- `Local MCP Request Log` shows recent inbound local MCP requests separately from Session Replay
- `GPU Acceleration` shows Electron-reported hardware acceleration and GPU feature status

The GPU status card is available only when the preload bridge exposes `window.api.window.getGpuStatus()`.
The Tooling section is available only when the preload bridge exposes `window.api.tooling.getStatus()` and `window.api.tooling.syncOriginMain()`.

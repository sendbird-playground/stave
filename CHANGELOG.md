## [0.4.3](https://github.com/OWNER/stave/compare/v0.4.2...v0.4.3) (2026-04-20)

### Highlights

- restore chat message-list scrolling by making the message pane a flex column so the conversation surface can inherit the remaining height correctly

### References

- [#518](https://github.com/OWNER/stave/pull/518)

## [0.4.2](https://github.com/OWNER/stave/compare/v0.4.1...v0.4.2) (2026-04-20)

### Highlights

- add an editor markdown preview mode with toolbar integration and regression coverage so previewing longer notes no longer depends on raw source-only editing
- make Coliseum default-model selection consistent across the launcher and reviewer dialogs, and refresh the related docs screenshots and launcher guidance
- fix floating Plan and Todo overlays so they stay in the chat pane stacking context instead of slipping behind or conflicting with the input dock

### References

- [#514](https://github.com/OWNER/stave/pull/514)
- [#515](https://github.com/OWNER/stave/pull/515)
- [#516](https://github.com/OWNER/stave/pull/516)

## [0.4.1](https://github.com/OWNER/stave/compare/v0.4.0...v0.4.1) (2026-04-20)

### Highlights

- keep completed Coliseum arena runs intact across workspace snapshot and runtime-cache compaction so parent, branch, and reviewer messages no longer disappear after a run settles
- add regression coverage for Coliseum snapshot persistence and runtime cache retention, including reviewer-task retention while arena state remains active
- restore the public docs build by publishing the Stave Model Router page in the public docs index so GitHub Pages deployment succeeds again

### References

- [#512](https://github.com/OWNER/stave/pull/512)
- [#511](https://github.com/OWNER/stave/pull/511)

## [0.4.0](https://github.com/OWNER/stave/compare/v0.3.9...v0.4.0) (2026-04-20)

### Highlights

- launch **Coliseum**, a new side-by-side multi-model execution flow that fans a prompt out to 2-4 providers, hides the temporary branches from the normal task UI, and lets users promote a winning answer back into the parent task
- extend Coliseum with reviewer runs, partial-pick follow-up drafting, shared file attachments, `Cmd/Ctrl+Enter` submit, sidebar activity indicators, and launcher/layout polish across the arena and prompt surfaces
- add a keyboard-aware preset bar to the task shell, including settings-based preset management and ordering, `Ctrl+1-9` preset launch shortcuts, and a unified `+` launcher for new tasks and CLI sessions
- formalize workspace handoff through `.stave/context/plans/<taskIdPrefix>_<timestamp>.md` plan files, inject that convention into task awareness and canonical request context, and document the workflow in repo policy files
- harden Claude and shared provider runtime flows by tightening plan-mode behavior, adding approval-decision timeout protection, and hiding transient "sending request to model" system events from the assistant trace
- fix approval notification state so approvals mark the correct message/request as read without cross-task or cross-workspace collisions, and improve tooling sync status when a repo exposes `origin/master` instead of `origin/main`
- polish desktop UX around the keyboard-shortcuts drawer and image lightbox layering, and refresh the top-level README to point users at the new Coliseum documentation

### References

- [#496](https://github.com/OWNER/stave/pull/496)
- [#497](https://github.com/OWNER/stave/pull/497)
- [#498](https://github.com/OWNER/stave/pull/498)
- [#499](https://github.com/OWNER/stave/pull/499)
- [#500](https://github.com/OWNER/stave/pull/500)
- [#501](https://github.com/OWNER/stave/pull/501)
- [#502](https://github.com/OWNER/stave/pull/502)
- [#503](https://github.com/OWNER/stave/pull/503)
- [#504](https://github.com/OWNER/stave/pull/504)
- [#505](https://github.com/OWNER/stave/pull/505)
- [#506](https://github.com/OWNER/stave/pull/506)
- [#507](https://github.com/OWNER/stave/pull/507)
- [#508](https://github.com/OWNER/stave/pull/508)
- [#509](https://github.com/OWNER/stave/pull/509)

## [0.3.9](https://github.com/OWNER/stave/compare/v0.3.8...v0.3.9) (2026-04-19)

### Highlights

- add a configurable preset bar between the task tabs and chat panel so teams can launch common Claude, Codex, Stave Auto, and native CLI-session flows in one click
- add `Alt+0-9` model shortcuts with persisted slot mappings, updated keyboard-shortcut docs, and settings support for quick provider/model switching from the prompt surface
- archive workspaces instantly in the renderer while git worktree removal, branch cleanup, script shutdown, and persistence cleanup continue in the background
- harden Orbit workspace-script launching by tokenizing direct commands safely, falling back to a shell wrapper only when necessary, and tightening the associated regression coverage
- keep the full-screen image lightbox above the app menu and other overlay layers so screenshot and media previews are no longer hidden behind app chrome
- refresh Codex app-server ChatGPT auth-token handling, return explicit JSON-RPC errors on refresh failure, and show clearer account readiness states in Codex settings
- refresh the local skill/docs guidance around provider-runtime symmetry so the docs site and skill index better explain cross-provider env and runtime checks

### References

- [#489](https://github.com/OWNER/stave/pull/489)
- [#490](https://github.com/OWNER/stave/pull/490)
- [#491](https://github.com/OWNER/stave/pull/491)
- [#492](https://github.com/OWNER/stave/pull/492)
- [#493](https://github.com/OWNER/stave/pull/493)
- [#494](https://github.com/OWNER/stave/pull/494)

## [0.3.8](https://github.com/OWNER/stave/compare/v0.3.7...v0.3.8) (2026-04-17)

### Highlights

- rebuild the public landing page and docs site on shadcn primitives with a new end-user information architecture, `Cmd+K` search, TOC scroll-spy, and a task-oriented rewrite of the core feature docs; follow-up fixes repair Tailwind class scanning for shared primitives, the `CommandDialog` wrapper, and home-route screenshot paths so the preview renders cleanly on desktop and mobile
- add an in-app **Changelog** viewer under Settings → System that renders the bundled `CHANGELOG.md` with linkified PR/commit references and a version badge
- add manual and auto refresh to the Source Control panel with persisted interval options (Off / 5s / 10s / 30s / 1m), visibility-aware polling, and a non-flickering background tick path
- upgrade the default Claude Opus tier to 4.7, add a `claude-opus-4-7[1m]` 1M-context variant, and migrate legacy 4.6 selections across settings, Stave Auto profiles, the model fallback map, and human-readable labels
- auto-detect GUI-launched `claude` and `codex` binaries installed under nvm / fnm / volta (with a cached login-shell `command -v` probe covering asdf / mise / chruby / custom PATH) so Stave resolves node-version-manager CLIs on macOS without manual `STAVE_*_CLI_PATH` overrides
- prewarm Monaco at idle to eliminate the first-open editor freeze, reset the ghostty renderer before replaying restored terminal screen state, and extend Shiki `<pre>` backgrounds across horizontal scroll in chat code blocks
- migrate inline completions to the Claude Agent SDK directly, dropping the separate `@anthropic-ai/sdk` dependency and bumping Claude Agent SDK to 0.2.112
- stop TodoWrite floater state from persisting across user messages, enlarge the floater typography/spacing for readability, and surface Codex native `todo_list` items through the TodoWrite bridge

### References

- [#476](https://github.com/OWNER/stave/pull/476)
- [#477](https://github.com/OWNER/stave/pull/477)
- [#478](https://github.com/OWNER/stave/pull/478)
- [#479](https://github.com/OWNER/stave/pull/479)
- [#480](https://github.com/OWNER/stave/pull/480)
- [#481](https://github.com/OWNER/stave/pull/481)
- [#482](https://github.com/OWNER/stave/pull/482)
- [#483](https://github.com/OWNER/stave/pull/483)
- [#484](https://github.com/OWNER/stave/pull/484)
- [#485](https://github.com/OWNER/stave/pull/485)
- [#486](https://github.com/OWNER/stave/pull/486)
- [#487](https://github.com/OWNER/stave/pull/487)

## [0.3.7](https://github.com/OWNER/stave/compare/v0.3.6...v0.3.7) (2026-04-16)

### Highlights

- launch a public docs site on GitHub Pages and rebuild the landing/docs experience around end-user install, workflow, and feature reference guides with refreshed screenshots and tighter copy
- add direct docs entry points from the README and install flow, replace the old static landing bundle with the new site build pipeline, and keep the public docs/navigation separated from contributor-only repository docs
- show an in-app quit confirmation for `Cmd+Q` and other app-quit requests, route confirmation through the renderer when available, and keep a native-dialog fallback when the desktop window cannot handle the request
- add `Claude Opus 4.7` as the default Opus-tier model, expose `xhigh` Claude effort where supported, and upgrade older Opus 4.6 selections across settings, Stave Auto presets, prompt drafts, and runtime option handling
- keep the new Claude model and effort options aligned across settings UI, chat input runtime state, IPC schemas, persisted workspace/task context, and regression coverage

### References

- [#473](https://github.com/OWNER/stave/pull/473)
- [#474](https://github.com/OWNER/stave/pull/474)
- [25902c9](https://github.com/OWNER/stave/commit/25902c9e0d3c8df1b01ec729402eb0d35ff8dd9b)
- [218faff](https://github.com/OWNER/stave/commit/218faff8412492178898b7461834e2138d8d8840)
- [966c0a3](https://github.com/OWNER/stave/commit/966c0a3cecad2f23ba8eb631e6aaa24c0a4b05e7)
- [df8c6f8](https://github.com/OWNER/stave/commit/df8c6f8d99db617ccfe4ac3ce3dd300d0f40dd24)

## [0.3.6](https://github.com/OWNER/stave/compare/v0.3.5...v0.3.6) (2026-04-16)

### Highlights

- upgrade the Claude SDK integration, add a richer Codex model catalog and selector flow, and keep provider runtime contracts aligned across renderer, IPC, and runtime layers
- harden approval and permission handling by updating provider mode defaults, mapping Codex MCP elicitations into explicit approvals, and fixing Claude auto-approval conflicts and notification approval state
- improve desktop runtime safety with Cmd+Q confirmation, inactive terminal output buffering, preserved branch-case worktree naming, and a refactored workspace-scripts state flow backed by new tests
- polish input and settings UX across prompt follow-up flows, provider settings, project settings, Codex option layout, and Claude advisor copy so review and configuration surfaces behave more predictably
- refresh repository-facing docs with focused onboarding and contributor guidance, a Codex guardian upgrade checklist, and a lean cross-provider context-sharing plan

### References

- [#453](https://github.com/OWNER/stave/pull/453)
- [#450](https://github.com/OWNER/stave/pull/450)
- [#455](https://github.com/OWNER/stave/pull/455)
- [#459](https://github.com/OWNER/stave/pull/459)
- [#460](https://github.com/OWNER/stave/pull/460)
- [#463](https://github.com/OWNER/stave/pull/463)
- [#464](https://github.com/OWNER/stave/pull/464)
- [#465](https://github.com/OWNER/stave/pull/465)
- [#466](https://github.com/OWNER/stave/pull/466)
- [#471](https://github.com/OWNER/stave/pull/471)
- [9221a8c](https://github.com/OWNER/stave/commit/9221a8c3611264116a03e2581bd32910aa3dfc71)

## [0.3.5](https://github.com/OWNER/stave/compare/v0.3.4...v0.3.5) (2026-04-15)

### Bug Fixes

- normalize executable lookup results so alias-style shell output and quoted paths resolve to runnable Claude and Codex CLI executables
- apply the same path normalization to explicit overrides and fallback candidates in provider runtime resolution so both runtimes keep symmetric launch behavior
- add regression coverage for executable normalization, CLI env resolution, and provider executable lookup

### References

- [#449](https://github.com/OWNER/stave/pull/449)

## [0.3.4](https://github.com/OWNER/stave/compare/v0.3.3...v0.3.4) (2026-04-15)

### Highlights

- detect pre-commit hook failures during automatic PR commits, run `eslint --fix` and `prettier --write` on staged lintable files, re-stage the result, and retry the commit once before failing
- add `Cmd/Ctrl+,` as a global shortcut for Settings and expose the shortcut in both the command palette and the in-app keyboard shortcut guide
- let users close editor tabs, task tabs, CLI session tabs, and docked terminal tabs with middle-click while keeping managed tasks protected from accidental archive
- recover Codex provider streams when polling hits a stale retained replay window cursor so direct polling and push-to-poll fallback continue without surfacing a user-visible stream failure
- map empty-form Codex MCP elicitation requests into a submit-or-decline prompt so binary approval flows can use tool metadata instead of dropping the request

### References

- [#442](https://github.com/OWNER/stave/pull/442)
- [#443](https://github.com/OWNER/stave/pull/443)
- [#444](https://github.com/OWNER/stave/pull/444)
- [#445](https://github.com/OWNER/stave/pull/445)
- [ed1169f](https://github.com/OWNER/stave/commit/ed1169f923dc5a84e0c15d325be7d2d866595db8)

## [0.3.3](https://github.com/OWNER/stave/compare/v0.3.2...v0.3.3) (2026-04-15)

### Bug Fixes

- stop forcing a fallback `CLAUDE_CONFIG_DIR` so Claude CLI can use its native config lookup and keep the authenticated session visible inside Stave
- only pass `CLAUDE_CONFIG_DIR` through when the user or login shell explicitly exports it, avoiding false logged-out status on newer Claude CLI releases
- add regression coverage to keep the Claude env builder from reintroducing an implicit config-dir override

### References

- [#440](https://github.com/OWNER/stave/pull/440)

## [0.3.2](https://github.com/OWNER/stave/compare/v0.3.1...v0.3.2) (2026-04-14)

### Bug Fixes

- restore login-shell PATH inheritance and config-home parity so app-launched Claude, Codex, and tooling status checks resolve the same executables and auth state as an interactive shell
- reset Plan Viewer floating state when the visible workspace, task, or latest plan changes so stale drag position no longer leaks across context switches
- keep CLI session padding and the xterm viewport background aligned with the active terminal theme token across light and dark mode
- restore the missing `node:path` import in the Claude SDK runtime and add regression coverage for relative `cwd` fallback when loading native commands

### References

- [#434](https://github.com/OWNER/stave/pull/434)
- [#436](https://github.com/OWNER/stave/pull/436)
- [#437](https://github.com/OWNER/stave/pull/437)
- [#438](https://github.com/OWNER/stave/pull/438)

## [0.3.1](https://github.com/OWNER/stave/compare/v0.3.0...v0.3.1) (2026-04-14)

### Bug Fixes

- restore login-shell PATH inheritance for app-launched Claude and Codex runtimes so provider tools can resolve `node` consistently after GUI launch
- align Claude, Codex, and tooling status env construction so auth checks and runtime execution use the same config-home and PATH rules
- add regression coverage for cloned runtime env PATH preservation and login-shell override precedence

## [0.3.0](https://github.com/OWNER/stave/compare/v0.2.3...v0.3.0) (2026-04-14)

### Highlights

- Simplified workspace restore so active tasks reopen faster, latest task messages load first, and non-critical refresh work moves into the background.
- Slimmed desktop persistence around workspace shell summaries and artifact-backed editor bodies while removing stale raw turn diagnostics from the app path.
- Hardened provider and host-service runtime flows with framed internal transport plus recoverable Codex App Server overflow handling for long conversations.
- Polished core session UI with safer dialog dismissal, cleaner plan and todo layering, and removal of the unsupported Claude fast mode toggle from the product surface.

### Features

- **workspace:** simplify restore state and harden runtime flows ([#432](https://github.com/OWNER/stave/issues/432)) ([0c23b50](https://github.com/OWNER/stave/commit/0c23b50c45dde35609ce9ad5249508dfd3e25841))

### Bug Fixes

- **dialog:** close settings dialog on escape ([#430](https://github.com/OWNER/stave/issues/430)) ([d8b980b](https://github.com/OWNER/stave/commit/d8b980b97cfc4dc7d4fed991c4f3bf0e0206d901))
- focus overlap ([#431](https://github.com/OWNER/stave/issues/431)) ([fa0339c](https://github.com/OWNER/stave/commit/fa0339c5c507d9985d03a75f65c6ee138055e37c))
- **session:** keep plan viewer above todo floater ([#429](https://github.com/OWNER/stave/issues/429)) ([d2714f8](https://github.com/OWNER/stave/commit/d2714f8a8a5443a6fd5cce78139216fb14e1e546))
- **ui:** hide Claude fast mode toggle ([#428](https://github.com/OWNER/stave/issues/428)) ([4c7cafd](https://github.com/OWNER/stave/commit/4c7cafdf7f93ef253482563f1bee6c16d3c747e5))

## [0.2.3](https://github.com/OWNER/stave/compare/v0.2.2...v0.2.3) (2026-04-14)

### Features

- **dialog:** add reusable Escape-key dismissal plus ARIA and focus support across Settings, image previews, and task dialogs ([#423](https://github.com/OWNER/stave/issues/423)) ([f9a593a](https://github.com/OWNER/stave/commit/f9a593a010bf6611052c701dc9f412b239e45089))
- **prompt-input:** show clearer queued follow-up summaries and preserve attachment-only queued turns for auto-dispatch after the active response finishes ([#425](https://github.com/OWNER/stave/issues/425)) ([42d5a53](https://github.com/OWNER/stave/commit/42d5a532c18553d5e566b59f6952d202f89e4a7e))
- **pr:** resolve pull request diffs against the correct remote tracking base branch when local base refs are stale ([#426](https://github.com/OWNER/stave/issues/426)) ([5363abf](https://github.com/OWNER/stave/commit/5363abf22db005bd2382de54a6e96c84c8dd7a74))

### Bug Fixes

- **cli-session:** always launch Claude CLI sessions in native auto mode and cover the runtime-option path with regression tests ([#422](https://github.com/OWNER/stave/issues/422)) ([7642889](https://github.com/OWNER/stave/commit/7642889bc8f35c890d877724b8ec27a39d87c3c2))
- **cli-session:** remove the stray light-theme panel border and align the xterm viewport background with the terminal theme token ([#421](https://github.com/OWNER/stave/issues/421)) ([fda4e3e](https://github.com/OWNER/stave/commit/fda4e3e4d8e73b03fb48240bb5ea6d2dc045456f))
- **terminal:** persist dock open state so workspace restores stop auto-opening unwanted terminal tabs ([#424](https://github.com/OWNER/stave/issues/424)) ([96ef660](https://github.com/OWNER/stave/commit/96ef6608c0eccfd6f8efea8ce9a884ae3d23e7ff))

## [0.2.2](https://github.com/OWNER/stave/compare/v0.2.1...v0.2.2) (2026-04-14)

### Bug Fixes

- compact oversized provider turn requests before they hit the host-service stdin protocol limit, so chat turns keep starting instead of crashing the provider runtime
- preserve task-critical context while trimming lower-priority repo-map and bulk context payloads during transport compaction
- retry provider turn startup once with a smaller transport payload when the first request still overflows the host-service boundary
- resolve terminal theme tokens through computed rgb values so dock and CLI terminals keep rendering correctly when theme colors are defined with oklch

## [0.2.1](https://github.com/OWNER/stave/compare/v0.2.0...v0.2.1) (2026-04-14)

### Bug Fixes

- **claude-cli:** gate auto mode by cli version ([c2f76e0](https://github.com/OWNER/stave/commit/c2f76e0bd6b5e987b2a8b7f1843130cc0295713e))
- **ui:** align dark-mode terminal background with background token ([9157045](https://github.com/OWNER/stave/commit/9157045cdc8ee1f6c43df4ff13231900bd2af2ea))

## [0.2.0](https://github.com/OWNER/stave/compare/v0.1.2...v0.2.0) (2026-04-14)

### Highlights

- Reworked integrated CLI sessions with better launch, restore, focus, resize, and restart behavior across task, workspace, and app switches.
- Hardened the desktop backend with host-service isolation plus transport and buffering guardrails for provider, terminal, and workspace-script flows.
- Added latest-turn summaries in the workspace Information panel so recent task context is easier to recover at a glance.
- Improved long-running workflows with paginated notification history, clickable output links, and a stronger Skills panel with `Use` and `View Instructions`.
- Reduced renderer churn around chat and CLI surfaces to make switching and streaming behavior more stable.

### Features

- btw steermode ([#358](https://github.com/OWNER/stave/issues/358)) ([b695095](https://github.com/OWNER/stave/commit/b695095e95a4674f07ca6e4254787428135018bc))
- **chat:** add interim message visibility setting ([#373](https://github.com/OWNER/stave/issues/373)) ([67c8666](https://github.com/OWNER/stave/commit/67c866671206a7f5a0583a95ef66d1ccc2404150))
- **cli-session:** add X close button with confirm dialog and Cmd+W support ([95b6617](https://github.com/OWNER/stave/commit/95b6617848532c7d43b5187ceee78c29251ff5fc))
- **cli-tabs:** add visual marker to CLI session tabs ([#364](https://github.com/OWNER/stave/issues/364)) ([8603cee](https://github.com/OWNER/stave/commit/8603cee653fa321089bdad52c25833bc20ca2bd9))
- ghostty terminal engine ([#368](https://github.com/OWNER/stave/issues/368)) ([1d0d946](https://github.com/OWNER/stave/commit/1d0d946de8c53645469f9493a47808e1f81565be))
- paginate notification history ([#397](https://github.com/OWNER/stave/issues/397)) ([a37146d](https://github.com/OWNER/stave/commit/a37146d19e3f5b77bed61e554ab20b2ba4d1629b))
- **skills-panel:** add Use button, View Instructions dialog ([#416](https://github.com/OWNER/stave/issues/416)) ([b80a488](https://github.com/OWNER/stave/commit/b80a4882bb4c8bea2b8aa1bf0668ba9ddde85b99))
- terminal ghostty ([#359](https://github.com/OWNER/stave/issues/359)) ([cba5d2b](https://github.com/OWNER/stave/commit/cba5d2bb269698029818fbfe7175c43d1459bd56))
- terminal ghostty in the task tab ([#362](https://github.com/OWNER/stave/issues/362)) ([8d40428](https://github.com/OWNER/stave/commit/8d40428a46e505986919a1b237def2b51a807766))
- **terminal:** add empty-state cli session launcher ([#385](https://github.com/OWNER/stave/issues/385)) ([3a74189](https://github.com/OWNER/stave/commit/3a741895264dfb6554037bde20f679b24dd70ee8))
- todo ui ([#399](https://github.com/OWNER/stave/issues/399)) ([1ee1c3b](https://github.com/OWNER/stave/commit/1ee1c3b748cb2527ed6d1ec49d82f9b46c7b02d2))
- url clickable ([#342](https://github.com/OWNER/stave/issues/342)) ([d99ff4e](https://github.com/OWNER/stave/commit/d99ff4e37461fe56f1c6330d270ce396ad25a9e8))
- **workspace:** add latest turn summary ([#389](https://github.com/OWNER/stave/issues/389)) ([1cfc0ae](https://github.com/OWNER/stave/commit/1cfc0ae88ba99ad658e7a8f3d4ac6190a186081a))

### Bug Fixes

- approval no turn ([#346](https://github.com/OWNER/stave/issues/346)) ([631fd68](https://github.com/OWNER/stave/commit/631fd6885fcbdf9eb36103de1d3bcfa669a092f3))
- approval request state management and active turns listing ([#347](https://github.com/OWNER/stave/issues/347)) ([e27f656](https://github.com/OWNER/stave/commit/e27f656794b40826c384c64816e68db19ed5805c))
- approval workspace bug ([#361](https://github.com/OWNER/stave/issues/361)) ([8be1e23](https://github.com/OWNER/stave/commit/8be1e23de63b50eee489c615500740678915c55a))
- **assistant-trace:** include system events in boundary detection ([#354](https://github.com/OWNER/stave/issues/354)) ([6f65604](https://github.com/OWNER/stave/commit/6f656041451d8ff12d3591bd0bc48bf8f98ff1e2))
- **chat-input:** send prompt suggestions immediately ([#378](https://github.com/OWNER/stave/issues/378)) ([9ff5221](https://github.com/OWNER/stave/commit/9ff52211faca5deef42cf3eb8eeb18068d0351db))
- **chat:** clear submitted drafts before async send ([#374](https://github.com/OWNER/stave/issues/374)) ([5a7412d](https://github.com/OWNER/stave/commit/5a7412d581e21e86825552993ca6d540f24a581e))
- **ChatInput:** clear prompt input on queue entry ([#363](https://github.com/OWNER/stave/issues/363)) ([692ba54](https://github.com/OWNER/stave/commit/692ba54ad18a2e4e7516b522059a24c2e68f70cb))
- **ChatInput:** restore draft when message submission is blocked ([#379](https://github.com/OWNER/stave/issues/379)) ([f326d4f](https://github.com/OWNER/stave/commit/f326d4f124540cabb7c9a67fc5a6f16d9d9d0578))
- **build:** remove invalid syntax from radix patch script so installs and release packaging succeed on CI ([2f699a4](https://github.com/OWNER/stave/commit/2f699a48fc24322f90493d9874f117fcfbc55b76))
- claude auth ([#365](https://github.com/OWNER/stave/issues/365)) ([90b6c7a](https://github.com/OWNER/stave/commit/90b6c7a9e00b19c5d1c62193bae9baccee0faf79))
- claude todo ([#367](https://github.com/OWNER/stave/issues/367)) ([3a725cb](https://github.com/OWNER/stave/commit/3a725cbed76d4b50c025f56d7bcd5e3c4aaf6af1))
- cli session 0410 ([#388](https://github.com/OWNER/stave/issues/388)) ([1ca4771](https://github.com/OWNER/stave/commit/1ca47718a367f4e673ed977807264400fedc44a2))
- cli session rendering ([#407](https://github.com/OWNER/stave/issues/407)) ([50bdf2d](https://github.com/OWNER/stave/commit/50bdf2d824f39fbb21c5f61e35cf806c5dac6d60))
- cli session rendering continue 20260411 135310 ([#409](https://github.com/OWNER/stave/issues/409)) ([d02b95f](https://github.com/OWNER/stave/commit/d02b95f76c46a06e180439d7691bc5f46823c328))
- **cli-session:** harden reattach and restore flow ([#412](https://github.com/OWNER/stave/issues/412)) ([65317c3](https://github.com/OWNER/stave/commit/65317c30e7c9e1828966dd88bcfafa162f7bbc5f))
- **cli-session:** move padding to .xterm element so FitAddon and ResizeObserver work correctly ([08fabdd](https://github.com/OWNER/stave/commit/08fabdda7496ebec837906dc5d0c160974786a97))
- **cli-session:** prevent bottom clipping from FitAddon padding miscalculation ([1af7e33](https://github.com/OWNER/stave/commit/1af7e335cb9448d167c81dfcb2ac5fac449de6cb))
- **cli-session:** restore scrollback and viewport on session reattach ([6a6d663](https://github.com/OWNER/stave/commit/6a6d6637d07149387d9b4d434841175297f66aad))
- **cli-session:** stabilize xterm session panel ([#411](https://github.com/OWNER/stave/issues/411)) ([61b3a4b](https://github.com/OWNER/stave/commit/61b3a4b7e97fd60c68afd65f57917c402eac8d44))
- create pr ai generated ([#351](https://github.com/OWNER/stave/issues/351)) ([df28f9c](https://github.com/OWNER/stave/commit/df28f9c45381860cdd0af7b393e08b4c6b7f6f9a))
- create PR bugs ([#341](https://github.com/OWNER/stave/issues/341)) ([3df05aa](https://github.com/OWNER/stave/commit/3df05aaa53fcfcd206e83275920460b1aeb1132b))
- **create-pr:** prevent accidental dialog dismissal during flight ([#383](https://github.com/OWNER/stave/issues/383)) ([eff1cde](https://github.com/OWNER/stave/commit/eff1cdee7311471708c445d1171ed49eff12b9b7))
- file open path ([#340](https://github.com/OWNER/stave/issues/340)) ([3ecdaed](https://github.com/OWNER/stave/commit/3ecdaed226cd598e6cb4a3be578108003ae6f518))
- ghosty cli session & scroll ([#371](https://github.com/OWNER/stave/issues/371)) ([8ca2646](https://github.com/OWNER/stave/commit/8ca26469cece881dcb1f814c94f0a88c9e83ebe9))
- ghosty cli session scroll continue 20260409 133626 ([#382](https://github.com/OWNER/stave/issues/382)) ([0d5c3a1](https://github.com/OWNER/stave/commit/0d5c3a1b729c3d6a3cdf7eb7237a162805ae11f1))
- **host-service:** bound transport payload sizes ([b11fcba](https://github.com/OWNER/stave/commit/b11fcba751816e7a96d147fb86316ca8d1745327))
- infinite and crash review ([#380](https://github.com/OWNER/stave/issues/380)) ([f10e3e7](https://github.com/OWNER/stave/commit/f10e3e749b36e239d02980baba97019d649360a5))
- interim messages in claude ([#369](https://github.com/OWNER/stave/issues/369)) ([6a7bb89](https://github.com/OWNER/stave/commit/6a7bb89f2a7b6f185c321de9f92e21e77cb87ad5))
- **layout:** balance right panel horizontal padding to match header ([4ac65e6](https://github.com/OWNER/stave/commit/4ac65e60a78bccb55b4cbe0a0ff28cdfe3e582e2))
- lint error log ([#398](https://github.com/OWNER/stave/issues/398)) ([55de3a3](https://github.com/OWNER/stave/commit/55de3a35572966b76ce4dccf531cf50a26d9593a))
- **logging:** suppress diagnostic logs in production builds ([#413](https://github.com/OWNER/stave/issues/413)) ([06a7008](https://github.com/OWNER/stave/commit/06a700805a54da1ae1c9bf6a2c83abfda2941381))
- **lsp:** dedupe sender destroyed listeners ([10cde5b](https://github.com/OWNER/stave/commit/10cde5bae5e5a93e521bd357346237da2d01192d))
- notification enhancement ([#343](https://github.com/OWNER/stave/issues/343)) ([5929912](https://github.com/OWNER/stave/commit/5929912fa62d1088b8c37aeb82afa811438b9d2c))
- on off ([#355](https://github.com/OWNER/stave/issues/355)) ([d6fc1c8](https://github.com/OWNER/stave/commit/d6fc1c85db867eb2d3bca633861404f04e923878))
- **oom-guardrails:** bound pending push backlog ([84b06c3](https://github.com/OWNER/stave/commit/84b06c318aed96aaf0ddd4555ed89e211529cbf9))
- **oom-guardrails:** raise terminal buffer caps, split plan/tool throttle, add truncation iteration guard ([7f5c137](https://github.com/OWNER/stave/commit/7f5c13783f7b424fa74ab166da416f1f09af3ce0))
- pr description height ([#348](https://github.com/OWNER/stave/issues/348)) ([31143d5](https://github.com/OWNER/stave/commit/31143d57656b9e73f9467013123e8b9bf60f65e4))
- prompt codex leak ([#366](https://github.com/OWNER/stave/issues/366)) ([3c71733](https://github.com/OWNER/stave/commit/3c717335dae8850e28dcda137f6252739f53a36d))
- **provider-runtime:** bound codex app-server stream buffers ([3faaee5](https://github.com/OWNER/stave/commit/3faaee512660aefa4ac8f418174fedc8e89940a0))
- **provider-runtime:** harden OOM guardrails ([4f39d48](https://github.com/OWNER/stave/commit/4f39d48eb52cfb679ddcd18576d976414cf9bb3c))
- **provider:** release consumed push stream replay ([#405](https://github.com/OWNER/stave/issues/405)) ([a13b8eb](https://github.com/OWNER/stave/commit/a13b8eb6e87dd1be63f36d37dc4bbab3601c6512))
- **providers:** deduplicate tool events to prevent phantom loading spinners ([#356](https://github.com/OWNER/stave/issues/356)) ([eb1b815](https://github.com/OWNER/stave/commit/eb1b815cf362a709c5cd259a7735a0fa32c324a1))
- **provider:** stop aborting long-running turns ([#401](https://github.com/OWNER/stave/issues/401)) ([c32d295](https://github.com/OWNER/stave/commit/c32d295c6bd03eddac3a2f3c23bbc99ba1f74e73))
- queue message draft persistence logic ([#370](https://github.com/OWNER/stave/issues/370)) ([daa64a0](https://github.com/OWNER/stave/commit/daa64a0ff8daf342c5911faaa73e30cf9871a918))
- queue next ([#360](https://github.com/OWNER/stave/issues/360)) ([a274986](https://github.com/OWNER/stave/commit/a2749867f63300018b04f1216c3708c39d145db6))
- **queue:** clear queuedNextTurn immediately when sending ([#387](https://github.com/OWNER/stave/issues/387)) ([75e05cf](https://github.com/OWNER/stave/commit/75e05cffb15bcdf2ff959773e9fc5e647fd4299c))
- queued message ([#408](https://github.com/OWNER/stave/issues/408)) ([ce1f484](https://github.com/OWNER/stave/commit/ce1f48487dda162992bdf226a2adc8587ebbe05f))
- **runtime:** clean up reviewed resource regressions ([a4492dc](https://github.com/OWNER/stave/commit/a4492dc59bcd3bb25a47515db698c4fe84866565))
- **runtime:** close host-service regression gaps ([9425f72](https://github.com/OWNER/stave/commit/9425f725215e13d45426db72ef1606694f17c6db))
- **runtime:** harden provider session abort and add auto-recovery ([c16b67f](https://github.com/OWNER/stave/commit/c16b67fe115810964393934e03608e52b7aba0e8))
- script style ([#349](https://github.com/OWNER/stave/issues/349)) ([1a1451f](https://github.com/OWNER/stave/commit/1a1451f1c86d4d66423e322ee90937cb24c33356))
- **scripts:** clarify packaged desktop run commands ([7246894](https://github.com/OWNER/stave/commit/7246894db3eb685272b11856cde01e5b75f4c81c))
- skills catalog ui ([#352](https://github.com/OWNER/stave/issues/352)) ([db75e72](https://github.com/OWNER/stave/commit/db75e72d3c29c2fbbd8208ceec6f59f524ddcf88))
- **skills:** resolve catalog re-fetch loop with normalized paths ([#353](https://github.com/OWNER/stave/issues/353)) ([ca8cc4b](https://github.com/OWNER/stave/commit/ca8cc4b132107fb8507200e696169b6a4b2b1de8))
- stalled provider turns ([#403](https://github.com/OWNER/stave/issues/403)) ([875ff56](https://github.com/OWNER/stave/commit/875ff56f21375f3095987bd6ca3e8492b38dec53))
- stave auto routing ([#345](https://github.com/OWNER/stave/issues/345)) ([642854e](https://github.com/OWNER/stave/commit/642854ecc77a75591e48742b93e9d19edc2cef3e))
- stave mcp bugs ([#350](https://github.com/OWNER/stave/issues/350)) ([413c6c7](https://github.com/OWNER/stave/commit/413c6c71289d75305759fe943bdaea7a4f35b693))
- **store:** include terminal state in workspace projections ([5de12c8](https://github.com/OWNER/stave/commit/5de12c8fbb3257f9d8fae22f2f9f3b673eae3501))
- summary style ([#406](https://github.com/OWNER/stave/issues/406)) ([8eec441](https://github.com/OWNER/stave/commit/8eec4418e75c5015c132285ff1b1b004b66fe012))
- task cleared but ([#375](https://github.com/OWNER/stave/issues/375)) ([c11c6c3](https://github.com/OWNER/stave/commit/c11c6c31ba7efacb0761d20af3d0027645e6cccd))
- **terminal:** allow app shortcuts in terminal surfaces and fix CLI resize observer ([9227097](https://github.com/OWNER/stave/commit/9227097e787182058f35f28ba1665781552aede0))
- **terminal:** await async attachSession in dispatch + auto-create tab on workspace switch ([69ced57](https://github.com/OWNER/stave/commit/69ced57f3d8dc4d034ed3c4b1705eddbc7a04dbd))
- **terminal:** flush pty geometry after session reattach and restore visible viewport ([#404](https://github.com/OWNER/stave/issues/404)) ([0ec491e](https://github.com/OWNER/stave/commit/0ec491e39b6e6e4f33a554ad1bd366cf2ee8e94f))
- **terminal:** gracefully clean up terminal sessions on app quit ([#357](https://github.com/OWNER/stave/issues/357)) ([1901180](https://github.com/OWNER/stave/commit/1901180e8b191928fe6004e651c72e31a76cef62))
- **terminal:** harden cli session transport and renderer recovery ([#410](https://github.com/OWNER/stave/issues/410)) ([bde042a](https://github.com/OWNER/stave/commit/bde042a12b18e6e139ffad4aea84f4026bcbe7cb))
- **terminal:** harden resize path and built app logging ([b31bf50](https://github.com/OWNER/stave/commit/b31bf50bb1b7172f5639e1433d5202a86f0674e0))
- **terminal:** keep-alive + attach/detach session lifecycle for CLI/terminal sessions ([#402](https://github.com/OWNER/stave/issues/402)) ([64755e4](https://github.com/OWNER/stave/commit/64755e43a5daded4111d946145457b399fad3bac))
- **terminal:** prevent hidden session auto-creation ([#384](https://github.com/OWNER/stave/issues/384)) ([e79cb03](https://github.com/OWNER/stave/commit/e79cb0300f1095e249c6c075e3ce955e18239a4a))
- **terminal:** refresh ghostty theme on theme changes ([#377](https://github.com/OWNER/stave/issues/377)) ([df5d953](https://github.com/OWNER/stave/commit/df5d953edcb6941830c684fb30a9f304e2785fcd))
- **terminal:** resume cli sessions across app restarts ([#414](https://github.com/OWNER/stave/issues/414)) ([6bc0679](https://github.com/OWNER/stave/commit/6bc0679d77dc234f30a023c3b22aaa865993ac3d))
- **terminal:** stabilize cli session scrolling and reattachment ([#376](https://github.com/OWNER/stave/issues/376)) ([c5bdc4c](https://github.com/OWNER/stave/commit/c5bdc4cc33d286fccc5410dbf88785d8a2070ada))
- **terminal:** type web links addon callback ([3d26a04](https://github.com/OWNER/stave/commit/3d26a04731d1e672d05c6cedb2e5026c6cf593c4))
- **tokens-label:** update label color to use background opacity ([#396](https://github.com/OWNER/stave/issues/396)) ([02c99d7](https://github.com/OWNER/stave/commit/02c99d72950af0ca149f6cc8b57168d3b38e9216))
- **ui:** align information empty state and skill dialog ([d5f9834](https://github.com/OWNER/stave/commit/d5f98349d44666fa5084b5f3f3747f7c4de4a4b3))
- **ui:** polish composer and panel spacing ([63ee6b3](https://github.com/OWNER/stave/commit/63ee6b31b6070accc00ad09e87a51c098a8f4a98))
- weird chip ([#372](https://github.com/OWNER/stave/issues/372)) ([4893936](https://github.com/OWNER/stave/commit/48939368aeeb8bf6dd507c74aa66f111ec7f758a))
- **workspace:** prevent duplicates by using deterministic workspace IDs ([#381](https://github.com/OWNER/stave/issues/381)) ([bbdd89c](https://github.com/OWNER/stave/commit/bbdd89c367aa18ca4b2bad0e0bb7c92845d92dad))

### Performance Improvements

- **render:** memo-wrap CliSessionPanel and ChatArea to block cascade re-renders ([#415](https://github.com/OWNER/stave/issues/415)) ([8c2a1a6](https://github.com/OWNER/stave/commit/8c2a1a60155c885316e54cad9de1a305bf44a536))

## [0.1.2](https://github.com/OWNER/stave/compare/v0.1.1...v0.1.2) (2026-04-08)

### Highlights

- Improved macOS install and in-app update flows so Stave prefers the current writable app location, stages replacements more safely, and keeps `gh` discoverable for GUI-launched updates.
- Updated the terminal installer and daily auto-update scripts to detect the writable install target more reliably and recover better from failed app replacement.
- Kept pending approval requests visible in the chat input area even when the assistant trace is collapsed, with newest-first queueing and managed-task guardrails.
- Upgraded Electron to `41.1.1` and stopped leaving stale terminal sessions alive across workspace switches or hidden terminal states.

### Bug Fixes

- cot collapsed approval view ([#337](https://github.com/OWNER/stave/issues/337)) ([8482e10](https://github.com/OWNER/stave/commit/8482e103998452eb4585805ba050d09c205cab9b))
- **desktop:** upgrade electron to 41.1.1 and close stale terminal sessions ([#338](https://github.com/OWNER/stave/issues/338)) ([fccf017](https://github.com/OWNER/stave/commit/fccf017952dbc68b9aadce6ee2cf5dfb5d3b2e6b))
- installation ([#336](https://github.com/OWNER/stave/issues/336)) ([e22ded4](https://github.com/OWNER/stave/commit/e22ded4ef91ffda19f3410ea231da7703cfaed48))

## [0.1.1](https://github.com/OWNER/stave/compare/v0.1.0...v0.1.1) (2026-04-07)

### Highlights

- Added a chorded Zen mode (`Cmd/Ctrl+K`, then `Z`) plus a Command Palette entry for distraction-free chat and result review.
- Stabilized chat and Zen-mode scrolling, follow-to-bottom behavior, and transcript/composer spacing after the new focused layout landed.
- Added workspace hover previews in the sidebar so each workspace can show recent tasks, message counts, and running activity before you switch.
- Fixed packaged Claude authentication by preserving the Claude config directory when the desktop app launches Claude.
- Simplified saved plans in the Information panel so recent plan files open directly in the editor, while removing legacy plan-path prompt hints from injected task context.
- Hardened task recovery and chat UX with stale-turn hydration fixes, clearer reasoning expansion defaults, stronger modal z-index layering, and aggressive wrapping for long user messages.

### Features

- workspace summary ([#328](https://github.com/OWNER/stave/issues/328)) ([9671b15](https://github.com/OWNER/stave/commit/9671b15e7a5bfda6065e77742777be53d7a72ee4))
- **zen:** add terminal-style zen mode ([#326](https://github.com/OWNER/stave/issues/326)) ([47b6a5e](https://github.com/OWNER/stave/commit/47b6a5e69697d6077dfa9de9c599997e0d67bf08))

### Bug Fixes

- **claude:** preserve config dir for packaged auth ([01a0bb0](https://github.com/OWNER/stave/commit/01a0bb0e4df3b5999b1ae1c32f964e87ce286df2))
- cot default behavior ([#334](https://github.com/OWNER/stave/issues/334)) ([494b157](https://github.com/OWNER/stave/commit/494b157b7fe993120524371fc9ad721709932586))
- ensure user messages wrap aggressively ([#325](https://github.com/OWNER/stave/issues/325)) ([8802275](https://github.com/OWNER/stave/commit/8802275d5feb227abfeebb5a696cdd60c41e04aa))
- plans list and refresh bug ([#327](https://github.com/OWNER/stave/issues/327)) ([f27bb2c](https://github.com/OWNER/stave/commit/f27bb2cf6c855d1c06fc6f21316f97e474eaf5ee))
- resize zindex ([#333](https://github.com/OWNER/stave/issues/333)) ([829cc4c](https://github.com/OWNER/stave/commit/829cc4cf2bd5f70af560ed51c19380bb04808b3c))
- restore chat scroll from v0.1.0 baseline and fix zen mode regressions ([d717911](https://github.com/OWNER/stave/commit/d717911a17395d8a8479cfac9234470e0989d93f))
- **task-context:** remove legacy plans prompt hints ([eb96f41](https://github.com/OWNER/stave/commit/eb96f4155579e30ce6f5ba724fbc2f1dcd74e37a))
- turn not end bug ([#332](https://github.com/OWNER/stave/issues/332)) ([8ba0a45](https://github.com/OWNER/stave/commit/8ba0a45c59f74fa8d4a23e173851f826ecae5723))
- zen mode message scroll ([#329](https://github.com/OWNER/stave/issues/329)) ([1565857](https://github.com/OWNER/stave/commit/1565857ead10699c5c9bc47cf99cf542ed86d273))
- zen scroll 3rd ([#331](https://github.com/OWNER/stave/issues/331)) ([0ce46bb](https://github.com/OWNER/stave/commit/0ce46bb3755ca367e85a59ce2a2215a897ed7fd4))
- zenmode message scroll continue ([#330](https://github.com/OWNER/stave/issues/330)) ([2d6d3df](https://github.com/OWNER/stave/commit/2d6d3df8609189bca8b22888dfe7a20be093b526))

## [0.1.0](https://github.com/OWNER/stave/compare/v0.0.36...v0.1.0) (2026-04-07)

### New features

- Added provider mode presets and runtime guidance so Claude and Codex approval, sandbox, file-access, and network behavior can be switched more deliberately from the composer and settings UI.
- Migrated Codex onto the app-server runtime path, which strengthens request plumbing and supports the newer planning, approval, and connected-tool flows shipped in this release.
- Added ripgrep-powered explorer search with grouped results and jump-to-line navigation for faster codebase discovery inside the sidebar.
- Added Stave control from chat through the local MCP layer, expanding what task turns can do with workspace-aware actions and context.
- Surfaced workspace plans in the Information panel and tightened the plan workflow with preset-based mode controls, better approval restoration, and cleaner plan-session handoff.
- Added project base prompts and stronger task-context/shared-skill routing so prompts resolve the intended workspace and task context more reliably.
- Added in-app update controls in the top bar plus role-specific Stave Auto runtime overrides for more predictable automation behavior across providers.

### Features

- **app-update:** add in-app update button to top bar ([#296](https://github.com/OWNER/stave/issues/296)) ([0cd8a54](https://github.com/OWNER/stave/commit/0cd8a5452adffeb1327c1770809884260420584e))
- **control:** stave from chat ([#306](https://github.com/OWNER/stave/issues/306)) ([44ae3d1](https://github.com/OWNER/stave/commit/44ae3d1746fb072b82ea477f1aa0d9a083d47ab0))
- **explorer:** add file content search with ripgrep ([#290](https://github.com/OWNER/stave/issues/290)) ([5d9d086](https://github.com/OWNER/stave/commit/5d9d08606b6fffd8d30e9dc82a145e4da1c29579))
- plans in information ([#308](https://github.com/OWNER/stave/issues/308)) ([acf747d](https://github.com/OWNER/stave/commit/acf747d2858940a77beff1ee22f9d12398ae6d54))
- **project:** base prompt ([#304](https://github.com/OWNER/stave/issues/304)) ([5b001b1](https://github.com/OWNER/stave/commit/5b001b187910ac878b680a244b6d9dc15c45c3ee))
- **prompt-input:** add mode presets and reset plan sessions ([ca01b0f](https://github.com/OWNER/stave/commit/ca01b0f00d98e65ad3b1025daf52b21179f7bcfa))
- provider modes ([#323](https://github.com/OWNER/stave/issues/323)) ([3e88ce1](https://github.com/OWNER/stave/commit/3e88ce10f811ef2b67c83dd9e6c2c8d3607b91e3))
- **settings:** add provider runtime guidance ([#286](https://github.com/OWNER/stave/issues/286)) ([e52c1ca](https://github.com/OWNER/stave/commit/e52c1ca9f0d54d8bd87d5f91c19614631db7c2f5))
- **stave-auto:** add role-specific runtime controls ([#279](https://github.com/OWNER/stave/issues/279)) ([4787313](https://github.com/OWNER/stave/commit/47873136306361240836bf3e885eca7ef4509c83))

### Bug Fixes

- approval process logics ([#320](https://github.com/OWNER/stave/issues/320)) ([3171c01](https://github.com/OWNER/stave/commit/3171c016ca8c427dff0ddade2a689a4bd2fc92ea))
- **attachment-paste:** dedupe clipboard attachments by base64 payload ([#292](https://github.com/OWNER/stave/issues/292)) ([401bea8](https://github.com/OWNER/stave/commit/401bea88b999a79dcde80c2e1cb70d0d378d2666))
- **chat:** avoid duplicate image pastes and stalled claude plan turns ([#277](https://github.com/OWNER/stave/issues/277)) ([859a7f1](https://github.com/OWNER/stave/commit/859a7f1fafb929bc06d18b76c95b9523c1992f86))
- codex app server continue ([#316](https://github.com/OWNER/stave/issues/316)) ([c06c065](https://github.com/OWNER/stave/commit/c06c065b3473b05e4481eb238d1f015df7b53461))
- **codex:** plugins ([#301](https://github.com/OWNER/stave/issues/301)) ([0690132](https://github.com/OWNER/stave/commit/0690132132efdee7ee29280aef2e6a7e8231c0f0))
- **commands:** slop ([#314](https://github.com/OWNER/stave/issues/314)) ([d7959e1](https://github.com/OWNER/stave/commit/d7959e1aceaf7f6f489226d402d6f44f53961ea7))
- **context:** expose workspace plan conventions ([373f342](https://github.com/OWNER/stave/commit/373f342b8589a3b269f036d0a0efb2ed3c904d3f))
- create pr base ([#315](https://github.com/OWNER/stave/issues/315)) ([#318](https://github.com/OWNER/stave/issues/318)) ([3a03814](https://github.com/OWNER/stave/commit/3a03814fb2a11a41e03da92cf94e146d13881f98))
- create pr draft bug ([#322](https://github.com/OWNER/stave/issues/322)) ([398c8df](https://github.com/OWNER/stave/commit/398c8df3d80f598009c9e8f6705af740abf32dc9))
- create pr loading ([#315](https://github.com/OWNER/stave/issues/315)) ([4c2696c](https://github.com/OWNER/stave/commit/4c2696c4a79d70e1678d9ba520c375c602a3458c))
- create pr loading ([#315](https://github.com/OWNER/stave/issues/315)) ([#317](https://github.com/OWNER/stave/issues/317)) ([7f602ad](https://github.com/OWNER/stave/commit/7f602adc9a60bb9014b19b717df3522c7736dab9))
- devtool command ([#303](https://github.com/OWNER/stave/issues/303)) ([9924b08](https://github.com/OWNER/stave/commit/9924b0864bb49c6b41305413c3b92fdef954db26))
- **inspect:** include ambient type declaration files in workspace context ([#289](https://github.com/OWNER/stave/issues/289)) ([930812e](https://github.com/OWNER/stave/commit/930812eb87d1f0caff719817ce47947fa31bec61))
- missing provider chip ([#309](https://github.com/OWNER/stave/issues/309)) ([8db82d1](https://github.com/OWNER/stave/commit/8db82d15f5e593fe2313bbeee790cfa555096437))
- **model:** selector behavior ([#299](https://github.com/OWNER/stave/issues/299)) ([5e719f8](https://github.com/OWNER/stave/commit/5e719f82018d8c45b4aaa62a4cd4cd2ae994c82e))
- **muse:** behavior ([#307](https://github.com/OWNER/stave/issues/307)) ([3b3010c](https://github.com/OWNER/stave/commit/3b3010cd68238cda676cb5221a3be1b8bd53b0bc))
- **muse:** remove muse button from topbar ([#288](https://github.com/OWNER/stave/issues/288)) ([abd28ae](https://github.com/OWNER/stave/commit/abd28ae10ea8b389eafb8fe270c0cb44ab23b695))
- **muse:** workflow ([#294](https://github.com/OWNER/stave/issues/294)) ([5c8fbda](https://github.com/OWNER/stave/commit/5c8fbda1326cbd3f67e27853818f512ebec0e572))
- **new-task:** add empty task state and improve layout handling ([#297](https://github.com/OWNER/stave/issues/297)) ([5610376](https://github.com/OWNER/stave/commit/5610376365bd3d8ab2a22056319d55aa9b049c4c))
- orbit not working ([#305](https://github.com/OWNER/stave/issues/305)) ([ce1bca3](https://github.com/OWNER/stave/commit/ce1bca35ce9b02827a8ef1e1dfa4b5ce5a57c699))
- **plan:** normalize plan text and filter meaningless content ([#291](https://github.com/OWNER/stave/issues/291)) ([13a8b83](https://github.com/OWNER/stave/commit/13a8b8309d590db4ab48c55d6b2bdc1fd92426ac))
- **plan:** normalize plan text and filter meaningless content ([#291](https://github.com/OWNER/stave/issues/291)) ([#295](https://github.com/OWNER/stave/issues/295)) ([c5695b1](https://github.com/OWNER/stave/commit/c5695b162524d5d28cf092a4b802641772534d73))
- **prompt-input:** colorize mode selector icons ([048dbe6](https://github.com/OWNER/stave/commit/048dbe64733fab72cfd832df695ea86162ec5ea9))
- **prompt:** normalize activated skill context ([#281](https://github.com/OWNER/stave/issues/281)) ([3f5efa9](https://github.com/OWNER/stave/commit/3f5efa9f827270362bb10c2937b319b8f1b9456d))
- **pr:** prioritize pull request template context ([#298](https://github.com/OWNER/stave/issues/298)) ([b59f942](https://github.com/OWNER/stave/commit/b59f942af0c1e7c7f429cd4e3c8bd78d8b4b47cd))
- **runtime:** harden task context and shared skill roots ([#311](https://github.com/OWNER/stave/issues/311)) ([9c3a3af](https://github.com/OWNER/stave/commit/9c3a3af37351f24e060697713d24e1fff18c427f))
- setting providers selectbox ([#319](https://github.com/OWNER/stave/issues/319)) ([58acdcf](https://github.com/OWNER/stave/commit/58acdcfb906bbbb4ed76863451c2402875df84a5))
- **setting:** select ([#313](https://github.com/OWNER/stave/issues/313)) ([0a4c609](https://github.com/OWNER/stave/commit/0a4c6095a7d09794ae7e76cc556b27d6ca4ef99e))
- **settings:** resolve project selection logic in settings dialog ([#284](https://github.com/OWNER/stave/issues/284)) ([95b84d6](https://github.com/OWNER/stave/commit/95b84d6e16ba1b067ec2c95c9361e6219890e9bd))
- **settings:** stabilize providers select ([494b905](https://github.com/OWNER/stave/commit/494b905f3b6976e4ac66119fedb064cbdc4bc2ea))
- **skills:** require safe worktree cleanup cwd ([#280](https://github.com/OWNER/stave/issues/280)) ([f77914d](https://github.com/OWNER/stave/commit/f77914dfc9df6701646ece573062bc4e84811d3b))
- **skills:** route activated skills through prompt context ([#278](https://github.com/OWNER/stave/issues/278)) ([05a49d1](https://github.com/OWNER/stave/commit/05a49d15b8c6f31929aff7d3096136541db115c9))
- stave mcp awareness ([#321](https://github.com/OWNER/stave/issues/321)) ([90ec86e](https://github.com/OWNER/stave/commit/90ec86ee1342fa0044e7eb864a77df7f1efc3699))
- **stave:** model plan ([#302](https://github.com/OWNER/stave/issues/302)) ([8025551](https://github.com/OWNER/stave/commit/8025551ba2d95e750f4f15a25328969d53db7ea4))
- **ui:** stabilize app menu overlay layout ([#282](https://github.com/OWNER/stave/issues/282)) ([3723626](https://github.com/OWNER/stave/commit/37236266a7084ff33ff011f6b32c61714d52869c))
- **workspace:** reload persisted shells when cache is empty ([#312](https://github.com/OWNER/stave/issues/312)) ([9cee0f0](https://github.com/OWNER/stave/commit/9cee0f0ecc8284838f8ee63b92debff1e59df398))

## [0.0.36](https://github.com/OWNER/stave/compare/v0.0.35...v0.0.36) (2026-04-05)

### Features

- add Claude SDK prewarming and upgrade to 0.2.92 ([#240](https://github.com/OWNER/stave/issues/240)) ([f5a8eb3](https://github.com/OWNER/stave/commit/f5a8eb32c88b6368a51fe377fda150526c69eabd))
- add sidebar artwork theming with design selector ([#241](https://github.com/OWNER/stave/issues/241)) ([d57a5ff](https://github.com/OWNER/stave/commit/d57a5ff99cc1820534176892c569dfec90205ac8))
- add tabbed source control with history timeline view ([#244](https://github.com/OWNER/stave/issues/244)) ([b51043c](https://github.com/OWNER/stave/commit/b51043cfa7b6f5fa7fa0e47a5b123c8b398fef2b))
- add workspace automations editor and documentation ([#243](https://github.com/OWNER/stave/issues/243)) ([a0326b7](https://github.com/OWNER/stave/commit/a0326b7742b6fe2443d01208afc5b23f288cd5d3))
- add workspace automations system with lifecycle hooks ([#238](https://github.com/OWNER/stave/issues/238)) ([05a1313](https://github.com/OWNER/stave/commit/05a131347f08a37c9fe46eba52cd58efb86eddda))
- **assistant:** add stave assistant widget to app shell ([#271](https://github.com/OWNER/stave/issues/271)) ([403f8b4](https://github.com/OWNER/stave/commit/403f8b4a549133316af7d5d967d79cbe67ea9317))
- **ChatPanel:** trigger scroll on turn completion ([#250](https://github.com/OWNER/stave/issues/250)) ([8b65967](https://github.com/OWNER/stave/commit/8b65967af8e4d17e8984997e54ede303b98c6837))
- **lens:** add browser inspection panel with MCP tools ([#267](https://github.com/OWNER/stave/issues/267)) ([d9f7d2b](https://github.com/OWNER/stave/commit/d9f7d2b3f7fb80cb8cb72af0df7c2d4898d85f30))
- load persisted tasks from database in workspace shell ([#235](https://github.com/OWNER/stave/issues/235)) ([49a80cb](https://github.com/OWNER/stave/commit/49a80cb903af16939823921a51658c3dec22cb0d))
- **right-panel-title:** add icons to panel headers ([#256](https://github.com/OWNER/stave/issues/256)) ([0af60a8](https://github.com/OWNER/stave/commit/0af60a8c1743ee1703932c5bd55bbdebe781487e))
- **scm:** redesign source control panel with flat right-rail layouts ([#254](https://github.com/OWNER/stave/issues/254)) ([0f91c23](https://github.com/OWNER/stave/commit/0f91c238080541ae9cc36e0a3df3e4f83b6df733))
- **ui:** add stave muse and lens polish ([39cd3f8](https://github.com/OWNER/stave/commit/39cd3f8ab9ddad66fd2e0f48ec03b1e6c647d831))
- **workspace-automations:** add Orbit support for services ([#248](https://github.com/OWNER/stave/issues/248)) ([e45aff8](https://github.com/OWNER/stave/commit/e45aff8f34a788c72485720243ed6195439e05c2))
- **workspace-automations:** add task and turn lifecycle hooks ([#255](https://github.com/OWNER/stave/issues/255)) ([5cf3c89](https://github.com/OWNER/stave/commit/5cf3c89cb5d9b67f56f3b68765f3cd490aedb2ec))
- **workspace-continue:** add timestamped branch naming ([#242](https://github.com/OWNER/stave/issues/242)) ([94442c7](https://github.com/OWNER/stave/commit/94442c7060ddb99c855733ccf6375dab92bb2b8b))

### Bug Fixes

- **approval:** handle missing approval message locations ([#269](https://github.com/OWNER/stave/issues/269)) ([236d1a7](https://github.com/OWNER/stave/commit/236d1a722eb1885dfe5f01d8ca01e208db7d40c9))
- **chat-panel:** position conversation scroll button to the left ([#266](https://github.com/OWNER/stave/issues/266)) ([fffdb02](https://github.com/OWNER/stave/commit/fffdb02df47b2c82b74abcf7cd206c3568955902))
- **chat-panel:** position conversation scroll button to the left ([#266](https://github.com/OWNER/stave/issues/266)) ([#268](https://github.com/OWNER/stave/issues/268)) ([1a1fee3](https://github.com/OWNER/stave/commit/1a1fee3507d86e07d844e9213e7957c93cd93370))
- **codex:** preserve final plan responses in plan mode ([#246](https://github.com/OWNER/stave/issues/246)) ([62f67c1](https://github.com/OWNER/stave/commit/62f67c19fe676530ae2e1e451247214dc4fb322c))
- **controls:** remove deprecated on-failure approval policy ([#263](https://github.com/OWNER/stave/issues/263)) ([3f082e8](https://github.com/OWNER/stave/commit/3f082e895eb3ef44061b36d126ee93133c277686))
- defer plan viewer and prevent duplicate emissions ([#233](https://github.com/OWNER/stave/issues/233)) ([bc3df5d](https://github.com/OWNER/stave/commit/bc3df5d6fb35b3d886dac7e6d2a1efe875b1f07e))
- evict cached threads on abort to prevent stale resumption ([#236](https://github.com/OWNER/stave/issues/236)) ([1a1cff4](https://github.com/OWNER/stave/commit/1a1cff4a1562546a5b53c40035020b57916f7c47))
- **keyboard-shortcuts:** add global shift+tab shortcut for plan mode ([#262](https://github.com/OWNER/stave/issues/262)) ([c549e18](https://github.com/OWNER/stave/commit/c549e1836f96e5ad28bdcf6817622f70fd3df6cd))
- **palette:** shortcut ([#259](https://github.com/OWNER/stave/issues/259)) ([4cf0837](https://github.com/OWNER/stave/commit/4cf08374d96feb56f0eba5d5b5b23fea1a184465))
- **palette:** shortcut bug fix ([#260](https://github.com/OWNER/stave/issues/260)) ([2059d70](https://github.com/OWNER/stave/commit/2059d702ae5ff19dddc06bda443bd50a95001fd1))
- **plan:** viewer revise ([#265](https://github.com/OWNER/stave/issues/265)) ([79d2cec](https://github.com/OWNER/stave/commit/79d2cecccecc768afa62319bbf8241037bac1c2a))
- **scm:** expand untracked directories into file entries ([#232](https://github.com/OWNER/stave/issues/232)) ([83ac73d](https://github.com/OWNER/stave/commit/83ac73dad47d1722d6b63cbefa72b7bcb0d550fc))
- **shortcuts:** reposition focus button and toggle explorer sidebar ([#261](https://github.com/OWNER/stave/issues/261)) ([e07ea5e](https://github.com/OWNER/stave/commit/e07ea5e0b7bad8a978b49a8301031a928d7e683d))
- **sidebar:** resolve left resize boundary artifact ([#257](https://github.com/OWNER/stave/issues/257)) ([93d1584](https://github.com/OWNER/stave/commit/93d15846fa0dafebe9d2386c3e6e5537fda6e4a7))
- **styles:** adjust inset shadows on sidebar and modal elements ([#252](https://github.com/OWNER/stave/issues/252)) ([a2952ff](https://github.com/OWNER/stave/commit/a2952ff6113f122e95247e40e6417d5acf1cc73a))
- theme style token fix ([#264](https://github.com/OWNER/stave/issues/264)) ([682fbde](https://github.com/OWNER/stave/commit/682fbde28a82f39f71bbdc66fee44fab7abdb661))
- **tooltips:** adjust positioning in sidebar and popover ([#245](https://github.com/OWNER/stave/issues/245)) ([52b7364](https://github.com/OWNER/stave/commit/52b736425ebcadbf6d3e09b576c81293505935ba))
- **ui:** add spacing between suggestion chips and textarea ([c413710](https://github.com/OWNER/stave/commit/c41371047b23753f5784754abfcf002cb09714bd))
- **ui:** align suggestion chips with textarea content edge ([b84c7d3](https://github.com/OWNER/stave/commit/b84c7d3acfe5c5b331414f920ce5afe2a49decd3))
- **workspace-scripts:** correct automation schema exports ([009d8d0](https://github.com/OWNER/stave/commit/009d8d05616948f951aac8eff2b7a181ad5305be))

### Performance Improvements

- **app-store:** add workspace switch performance metrics ([#272](https://github.com/OWNER/stave/issues/272)) ([20c9dcb](https://github.com/OWNER/stave/commit/20c9dcb992596cdbe8f4774e4af59eea62df2c89))
- **app-store:** add workspace switch performance metrics ([#272](https://github.com/OWNER/stave/issues/272)) ([#274](https://github.com/OWNER/stave/issues/274)) ([712bbc1](https://github.com/OWNER/stave/commit/712bbc10a6aec8d6eee3bd189ef7f320d3579050))
- **workspace:** reduce switch fan-out ([#273](https://github.com/OWNER/stave/issues/273)) ([4f8952f](https://github.com/OWNER/stave/commit/4f8952f13da49204cfa770fe737c9d3a30c8366b))

## [0.0.35](https://github.com/OWNER/stave/compare/v0.0.34...v0.0.35) (2026-04-03)

### Highlights

- Added a global command palette (`Cmd/Ctrl+Shift+P`) with centralized command discovery and execution.
- Expanded message/file-link UX by promoting file references from inline code and code-fence metadata into navigable file chips.
- Added workspace scripts execution and plan-mode auto-approval flow, while removing the older task auto-approval UI path.
- Hardened provider event replay and routing behavior with segment boundary preservation, proposed-plan tag stripping, and explicit plan-mode routing.
- Improved sidebar and workspace productivity with prompt history navigation, workspace keyboard shortcuts, and cleaner hover/shortcut interactions.
- Refined thinking/reasoning presentation with replayable animated text behavior and settings-driven animation style controls.
- Removed legacy Session Replay and diagnostics panels to simplify the chat surface.

### Features

- **command-palette:** add global command palette on Cmd/Ctrl+Shift+P ([#221](https://github.com/OWNER/stave/issues/221)) ([77b1288](https://github.com/OWNER/stave/commit/77b12889aa8be16b9dba5bec4700b0296aa7709d))
- **message:** extract file paths from code fence metadata ([#210](https://github.com/OWNER/stave/issues/210)) ([be29fc8](https://github.com/OWNER/stave/commit/be29fc8165d93b732a6f4a6ea598e9552ae5c476))
- promote inline code file references to file chips ([#208](https://github.com/OWNER/stave/issues/208)) ([330744c](https://github.com/OWNER/stave/commit/330744cc9fb75d681aee9564ab63fece3b3acc90))
- **prompt-input:** add prompt history navigation in composer ([#209](https://github.com/OWNER/stave/issues/209)) ([4a6ff19](https://github.com/OWNER/stave/commit/4a6ff1951962d7620c5512e0d5b31e03c3f13f7c))
- **providers:** add segmentId to preserve provider text boundaries ([#215](https://github.com/OWNER/stave/issues/215)) ([e6fd05c](https://github.com/OWNER/stave/commit/e6fd05c6412ad2e921bfde3ce3e2e911354f1413))
- **scripts:** add workspace scripts with plan mode auto-approval ([#211](https://github.com/OWNER/stave/issues/211)) ([a828b58](https://github.com/OWNER/stave/commit/a828b58615703e3a39ea3ebb33d420f575d14619))
- **shortcuts:** add workspace selection keyboard shortcuts ([#217](https://github.com/OWNER/stave/issues/217)) ([314f450](https://github.com/OWNER/stave/commit/314f450cdbf7abce3863cfbe06448fb93b54dfd2))
- **sidebar:** show workspace shortcut on row hover ([#226](https://github.com/OWNER/stave/issues/226)) ([3e669d0](https://github.com/OWNER/stave/commit/3e669d0dd4bf38fcf098ac0d970708a11e589582))
- **stave:** short-circuit routing for plan mode ([#206](https://github.com/OWNER/stave/issues/206)) ([c09c3d7](https://github.com/OWNER/stave/commit/c09c3d78eefd1cc2e6d577c5dc0e7eae7e692874))
- **thinking:** add replayable animated text component ([#230](https://github.com/OWNER/stave/issues/230)) ([25b155c](https://github.com/OWNER/stave/commit/25b155ce5a2c68b82ba86dd91d9c6f6eb946a4f9))

### Bug Fixes

- **continue:** command palette style ([#224](https://github.com/OWNER/stave/issues/224)) ([dffe828](https://github.com/OWNER/stave/commit/dffe828074e1fb08eddde850f752c1407d5104fc))
- strip proposed_plan tags from chat messages ([#220](https://github.com/OWNER/stave/issues/220)) ([dd5895c](https://github.com/OWNER/stave/commit/dd5895c361cb19828ad115bf5cf978a5b03e9385))

## [0.0.34](https://github.com/OWNER/stave/compare/v0.0.33...v0.0.34) (2026-04-03)

### Highlights

- Added a stdio proxy transport for local MCP so sandboxed or subprocess-based hosts can connect without loopback HTTP access.
- Upgraded Codex SDK to 0.118.0 and refreshed the related runtime, trace, prompt, and UI integration points.
- Lowered Stave Auto supervisor defaults to Claude Sonnet, with Codex-only supervisor routing now using `gpt-5.4-mini`.
- Refreshed the landing page screenshot and feature messaging to match the current app.

### Features

- **mcp:** add stdio proxy transport for local MCP ([#200](https://github.com/OWNER/stave/issues/200)) ([c05c213](https://github.com/OWNER/stave/commit/c05c2133339d9e7cd807c67d2a64d997e2fbffef))

### Bug Fixes

- **stave:** update provider defaults and supporting changes ([e4d62bd](https://github.com/OWNER/stave/commit/e4d62bd253688eeb911aafdf4052b43eefd130b9))

## [0.0.33](https://github.com/OWNER/stave/compare/v0.0.32...v0.0.33) (2026-04-02)

### Features

- **cot:** add kind-specific icons and summary items to chain of thought ([#187](https://github.com/OWNER/stave/issues/187)) ([e9d65a6](https://github.com/OWNER/stave/commit/e9d65a60d20bb1e8c67ea62d2b8585ef024d9cfd))
- **EditorPanel:** add context menu to file explorer ([#178](https://github.com/OWNER/stave/issues/178)) ([69de48c](https://github.com/OWNER/stave/commit/69de48ca1c9ac47975cb7aa90924cd71162d8233))
- **editor:** refine file tab hierarchy ([#183](https://github.com/OWNER/stave/issues/183)) ([3e3de48](https://github.com/OWNER/stave/commit/3e3de4853d9e2136f16c7221d72152b295257e87))
- **persistence:** add workspace shell and task message loaders ([#182](https://github.com/OWNER/stave/issues/182)) ([66d1492](https://github.com/OWNER/stave/commit/66d149202858b47a18f80254e58deaa7162082b2))
- **pr-dialog:** add target branch picker ([#188](https://github.com/OWNER/stave/issues/188)) ([88be8ee](https://github.com/OWNER/stave/commit/88be8eedb9d7914ea4068e907142bde4b398708b))
- **terminal:** add push-based terminal output delivery ([#184](https://github.com/OWNER/stave/issues/184)) ([e0e69d9](https://github.com/OWNER/stave/commit/e0e69d9749c7bd66df844ec6eeeee5e3b76c24b5))
- **todo:** add getTodoProgress utility function ([#196](https://github.com/OWNER/stave/issues/196)) ([aa97440](https://github.com/OWNER/stave/commit/aa9744010e8cbb49d123b5a7b02463e854e24fdc))

### Bug Fixes

- **chat:** stabilize scroll-to-bottom during workspace switches ([#197](https://github.com/OWNER/stave/issues/197)) ([abc1c40](https://github.com/OWNER/stave/commit/abc1c40a4beae0781db9d0390deb0f2a937bb567))
- **completion-phrases:** ensure random phrase always returns string ([fa0674c](https://github.com/OWNER/stave/commit/fa0674ca9e6f7e180289a54b2c63faeb398b1193))
- eliminate scroll flicker in virtualized lists ([#198](https://github.com/OWNER/stave/issues/198)) ([e9fdcb2](https://github.com/OWNER/stave/commit/e9fdcb2cc8b986eee9f04878aa45a970d3d3977e))
- improve pull request dialog accessibility ([#189](https://github.com/OWNER/stave/issues/189)) ([a3c398d](https://github.com/OWNER/stave/commit/a3c398d42451be574e406ddcaa6991c86a89bf79))
- **SettingsDialog:** improve layout height and overflow handling ([#193](https://github.com/OWNER/stave/issues/193)) ([cc84864](https://github.com/OWNER/stave/commit/cc84864c8089042cf3e3bcba7b00de32591be6e9))
- **shimmer:** unify animation effects across AI elements ([#191](https://github.com/OWNER/stave/issues/191)) ([7c1975a](https://github.com/OWNER/stave/commit/7c1975af95f6d3cbeb451b1046b60f84395068c2))
- **terminal:** improve sessions sidebar design ([#181](https://github.com/OWNER/stave/issues/181)) ([48196e9](https://github.com/OWNER/stave/commit/48196e95137131dcdeff075328f179add1868eec))

## [0.0.32](https://github.com/OWNER/stave/compare/v0.0.31...v0.0.32) (2026-04-01)

### Features

- add Slack thread support to workspace information panel ([#171](https://github.com/OWNER/stave/issues/171)) ([ad131d5](https://github.com/OWNER/stave/commit/ad131d575de7d8b8b734aedb7b1f6ec2c2aca9bf))
- persist and surface workspace plan history ([#164](https://github.com/OWNER/stave/issues/164)) ([720f405](https://github.com/OWNER/stave/commit/720f4058b8a5001ad98c6e859aec56489a84654f))
- **ui:** add calendar and switch components ([#169](https://github.com/OWNER/stave/issues/169)) ([6a2b599](https://github.com/OWNER/stave/commit/6a2b59952d0f5decf62a3e76704ce2be2abf5198))
- **workspace:** add continue workspace for completed PRs ([#167](https://github.com/OWNER/stave/issues/167)) ([3df1f0a](https://github.com/OWNER/stave/commit/3df1f0a7439db1a5db1fec4aa4ad4780bd866c85))
- **workspace:** improve workspace information panel ([#166](https://github.com/OWNER/stave/issues/166)) ([a2cbdef](https://github.com/OWNER/stave/commit/a2cbdef3076feb2e2cda78e9b581d88bfa0c418c))

### Bug Fixes

- **chat:** guard plan approval and archived task turns ([#163](https://github.com/OWNER/stave/issues/163)) ([2bb474e](https://github.com/OWNER/stave/commit/2bb474ed01b89db1e5760c00152bd11adaec5dd2))
- correct text color classes with dark mode support ([#173](https://github.com/OWNER/stave/issues/173)) ([cd6d16d](https://github.com/OWNER/stave/commit/cd6d16d78ecadbd0658e93e656e2f994dd7d4d08))
- **editor:** hide editor panel when last tab is closed ([#162](https://github.com/OWNER/stave/issues/162)) ([45c0dca](https://github.com/OWNER/stave/commit/45c0dca2d66efb71f45fecb2f9fcb30e5daa6666))
- **workspace-information:** add confluence page support ([#175](https://github.com/OWNER/stave/issues/175)) ([d3dca17](https://github.com/OWNER/stave/commit/d3dca17037c3e521dc1da9df133364a3b900c584))

## [0.0.31](https://github.com/OWNER/stave/compare/v0.0.30...v0.0.31) (2026-04-01)

### Features

- add task auto-approval and improve plan history UI ([#158](https://github.com/OWNER/stave/issues/158)) ([f60f361](https://github.com/OWNER/stave/commit/f60f361a6f4e7b94696e7cf382dd110e9b3e744d))
- **codex:** enforce read-only sandbox for plan mode ([#154](https://github.com/OWNER/stave/issues/154)) ([2693bb8](https://github.com/OWNER/stave/commit/2693bb8f91519a79a822e93990922ec9e357005f))
- handle notifications for archived tasks ([#153](https://github.com/OWNER/stave/issues/153)) ([ccbe5de](https://github.com/OWNER/stave/commit/ccbe5de79d76ffe42fe838848cc899b8b18aac03))
- **local-mcp:** add paginated browsing with lazy payload loading ([#160](https://github.com/OWNER/stave/issues/160)) ([30caacf](https://github.com/OWNER/stave/commit/30caacf7b976cdd4691947b34100d43c0c46328e))
- **plan-viewer:** respond to input dock height changes ([#155](https://github.com/OWNER/stave/issues/155)) ([4fb089c](https://github.com/OWNER/stave/commit/4fb089cd30c3cd1982426cfac6dec0e426cb03bc))
- **workspace:** add workspace information panel ([#157](https://github.com/OWNER/stave/issues/157)) ([1d3dafb](https://github.com/OWNER/stave/commit/1d3dafbe5e2ac824199ff6b87f982c498d62507e))

### Bug Fixes

- **chat:** stabilize zustand selector snapshots ([#152](https://github.com/OWNER/stave/issues/152)) ([75e2434](https://github.com/OWNER/stave/commit/75e24345b47ac20addb349147fca5c7af26d7418))

## [0.0.30](https://github.com/OWNER/stave/compare/v0.0.29...v0.0.30) (2026-04-01)

### Features

- **settings:** add native tooling diagnostics ([#149](https://github.com/OWNER/stave/issues/149)) ([6222b37](https://github.com/OWNER/stave/commit/6222b37de0b3931a0a2fc94e1eb8723aef825851))
- **theme:** add matching light theme presets ([#150](https://github.com/OWNER/stave/issues/150)) ([a8a5308](https://github.com/OWNER/stave/commit/a8a5308b64c590f09c3d190d9d6b908a8a9526a2))

### Bug Fixes

- stabilize workspace turns and gh lookup ([#148](https://github.com/OWNER/stave/issues/148)) ([af87f75](https://github.com/OWNER/stave/commit/af87f755a15caa8ed7964e464f74ceb57d8da1b1))

## [0.0.29](https://github.com/OWNER/stave/compare/v0.0.28...v0.0.29) (2026-03-31)

### Features

- add ESLint formatter and format-on-save shortcut ([#133](https://github.com/OWNER/stave/issues/133)) ([487072b](https://github.com/OWNER/stave/commit/487072b06f7dce9e28c4fe7676def7fc580c35f4))
- add local packaged-app MCP automation surface ([#123](https://github.com/OWNER/stave/issues/123)) ([e6b5c39](https://github.com/OWNER/stave/commit/e6b5c39fe50645384c8e49b5e7dc4ad0f3f5ebbc))
- add stave-design-system skill and workflow documentation ([#126](https://github.com/OWNER/stave/issues/126)) ([c5f2f99](https://github.com/OWNER/stave/commit/c5f2f998d68001b29e7891c64b539c0190a25b05))
- add workspace refresh feature ([#132](https://github.com/OWNER/stave/issues/132)) ([2ec6ae8](https://github.com/OWNER/stave/commit/2ec6ae85f0c2c3c943fa713f7b997e39fc0f3947))
- **auto-update:** add automatic daily updates ([#136](https://github.com/OWNER/stave/issues/136)) ([5d92355](https://github.com/OWNER/stave/commit/5d9235528ad312c739a92331c8ea58e9b5cdf03b))
- **filesystem:** show external symlinks in explorer ([#143](https://github.com/OWNER/stave/issues/143)) ([c349f41](https://github.com/OWNER/stave/commit/c349f41715b50147423569d59bd1d4de172883a0))
- implement Codex native plan-mode support ([#116](https://github.com/OWNER/stave/issues/116)) ([ac27d1d](https://github.com/OWNER/stave/commit/ac27d1d4931c4d78324c12e896308db17e9bacbf))
- **local-mcp:** add inbound request log viewer ([#128](https://github.com/OWNER/stave/issues/128)) ([5501ede](https://github.com/OWNER/stave/commit/5501ede86d8e09d26723c9cf8ae4fbf7d97e525d))
- **notifications:** add configurable notification sounds ([#113](https://github.com/OWNER/stave/issues/113)) ([db5844e](https://github.com/OWNER/stave/commit/db5844e84dfb8c908eaa954c7557e0c2eea0c968))
- **notifications:** add custom audio file upload for notification sound ([e48c361](https://github.com/OWNER/stave/commit/e48c36149ab2b95824b70fac1ddfc20c97b1cc14))
- **notifications:** add harvest notification preset ([#127](https://github.com/OWNER/stave/issues/127)) ([dd878d8](https://github.com/OWNER/stave/commit/dd878d8c0f4f61a687d886a8eb6cc52cc65a1d85))
- **plan:** add auto-approve setting for plan mode ([#135](https://github.com/OWNER/stave/issues/135)) ([78c90ae](https://github.com/OWNER/stave/commit/78c90ae7607063aa67a1cf7d114e31d658956a6b))
- **theme:** implement comprehensive theme system ([#139](https://github.com/OWNER/stave/issues/139)) ([608869e](https://github.com/OWNER/stave/commit/608869e6ae2963086fb42fc2ff98d6ba87dbced4))

### Bug Fixes

- **DFE-2508:** fix infinite re-render loop when creating new task tab ([#124](https://github.com/OWNER/stave/issues/124)) ([4b3a2ce](https://github.com/OWNER/stave/commit/4b3a2cecc2373bcfed33d88f8c34bb61062ec8ca))
- **editor:** increase tab strip vertical padding ([#130](https://github.com/OWNER/stave/issues/130)) ([7e45b1d](https://github.com/OWNER/stave/commit/7e45b1d9b927e8d17949c89264b0a69ab7d58000))
- **filesystem:** handle symlinks with cycle and boundary checks ([#115](https://github.com/OWNER/stave/issues/115)) ([61bff08](https://github.com/OWNER/stave/commit/61bff089b1c23be14cc329671149892ec32d1349))
- **layout:** prevent task tabs from stretching to full width ([#129](https://github.com/OWNER/stave/issues/129)) ([e5adf7a](https://github.com/OWNER/stave/commit/e5adf7a21b18079dd9dd755e02e4db89e746397a))
- **mcp:** handle managed tasks in the desktop ui ([#142](https://github.com/OWNER/stave/issues/142)) ([d79dca4](https://github.com/OWNER/stave/commit/d79dca4c3d45527f233e58b16954b36274de1217))
- **scm:** deduplicate check runs by name to avoid stale failures ([#141](https://github.com/OWNER/stave/issues/141)) ([9069fff](https://github.com/OWNER/stave/commit/9069fffa37860790854264b6b272e59388d28479))
- **TopBar:** add key prop to TopBarOpenPR for workspace changes ([#119](https://github.com/OWNER/stave/issues/119)) ([f059efe](https://github.com/OWNER/stave/commit/f059efef86bc2fa6d06b08b35341f863e4243f6d))
- **ui:** prevent tooltip overflow ([#145](https://github.com/OWNER/stave/issues/145)) ([388d7f3](https://github.com/OWNER/stave/commit/388d7f347307e1b067966b9a09c7faf4d8703a41))
- use createPortal for modals and fixed positioning ([#137](https://github.com/OWNER/stave/issues/137)) ([6ebcaf1](https://github.com/OWNER/stave/commit/6ebcaf1bed154dca4de16d67664626f3222d1b74))
- **workspace:** harden project integrity boundaries ([#144](https://github.com/OWNER/stave/issues/144)) ([208bafd](https://github.com/OWNER/stave/commit/208bafd1a4655d7d182fe59818524033ee84807c))

## [0.0.28](https://github.com/OWNER/stave/compare/v0.0.27...v0.0.28) (2026-03-30)

### Features

- **create-pr:** normalize PR titles against commit history ([#92](https://github.com/OWNER/stave/issues/92)) ([15c31bd](https://github.com/OWNER/stave/commit/15c31bde89be1ea8d6ca4e478d4156ad8a49f405))
- display PR status for non-default workspaces ([#101](https://github.com/OWNER/stave/issues/101)) ([07dd5ca](https://github.com/OWNER/stave/commit/07dd5ca9fed21f21867ea415547d730b9ff30f7a))
- **editor:** display full file path between tab strip and code editor ([#82](https://github.com/OWNER/stave/issues/82)) ([68a9a82](https://github.com/OWNER/stave/commit/68a9a826338275cda1def28acf25a01007b89f3d))
- **electron:** add Stave app icon ([#72](https://github.com/OWNER/stave/issues/72)) ([622adaa](https://github.com/OWNER/stave/commit/622adaa454bc668ff79e9a68eeea3bf43961b7cc))
- **logo:** add stave-auto icon with orange/green/blue color mix ([#110](https://github.com/OWNER/stave/issues/110)) ([c310c0a](https://github.com/OWNER/stave/commit/c310c0a9493017322ddbd7078c91c08c7b7683b3))
- **message:** support file links in markdown messages ([#103](https://github.com/OWNER/stave/issues/103)) ([aae1b06](https://github.com/OWNER/stave/commit/aae1b0660f4d0c73ca6a102be61665a34df47216))
- **metrics:** add memory usage popover to sidebar ([#87](https://github.com/OWNER/stave/issues/87)) ([e0f3707](https://github.com/OWNER/stave/commit/e0f37077675f8d5d09d00d3ba2110da35d80bbb3))
- notification system ([#93](https://github.com/OWNER/stave/issues/93)) ([759f0b7](https://github.com/OWNER/stave/commit/759f0b70c02f35fb375bdef9af3fed241741700b))
- **notifications:** add history view and idle completion alerts ([#109](https://github.com/OWNER/stave/issues/109)) ([10879ba](https://github.com/OWNER/stave/commit/10879ba53c0a6fc7e0c5f74d1ab65b73d4f7890a))
- **notifications:** add mark read and history view support ([#102](https://github.com/OWNER/stave/issues/102)) ([b3bccef](https://github.com/OWNER/stave/commit/b3bccef74c594cbd382615cdbdc2626b71b4be09))
- **sidebar:** change workspace close to archive ([#78](https://github.com/OWNER/stave/issues/78)) ([5144b3e](https://github.com/OWNER/stave/commit/5144b3e4d7ef1e9ae7252071fd933c6be65ca4a4))
- **sidebar:** swap task count with archive button on workspace hover ([#91](https://github.com/OWNER/stave/issues/91)) ([6077a0a](https://github.com/OWNER/stave/commit/6077a0af1bd7d741f51a775844e2fcb994dc80a2))
- **topbar:** replace open PR with create PR dialog ([#75](https://github.com/OWNER/stave/issues/75)) ([8fbe911](https://github.com/OWNER/stave/commit/8fbe9116fad35c444d959e533b39bdfa963569d0))
- **workspace:** add PR status tracking to sidebar and topbar ([#85](https://github.com/OWNER/stave/issues/85)) ([d462a82](https://github.com/OWNER/stave/commit/d462a82121837e4a5b880da51a52f0326d176847))

### Bug Fixes

- **branch-dropdown:** prevent branch detection race conditions ([#89](https://github.com/OWNER/stave/issues/89)) ([05b9845](https://github.com/OWNER/stave/commit/05b9845afbdd96547e03f07723ac3c93dabcba4b))
- **chat:** deduplicate code_diff parts for the same file path ([#86](https://github.com/OWNER/stave/issues/86)) ([f5c9c34](https://github.com/OWNER/stave/commit/f5c9c34abc3e2be5c0d9eca0be26edfbf43c7149))
- disable create PR button when tasks are responding ([#104](https://github.com/OWNER/stave/issues/104)) ([7c86db9](https://github.com/OWNER/stave/commit/7c86db911bebcc0e516090be3a39d7caca82cfa4))
- **explorer:** show build folder in file tree ([734adb0](https://github.com/OWNER/stave/commit/734adb0c3006c49d018d93264a8010b6d3fbf59f))
- **logo:** enlarge icons and refine bar scaling ([#69](https://github.com/OWNER/stave/issues/69)) ([8728b81](https://github.com/OWNER/stave/commit/8728b81509b8f33cb22fdfd7c916f175a6b9207a))
- **logo:** remove dark background from stave-logo.svg ([#70](https://github.com/OWNER/stave/issues/70)) ([3550fda](https://github.com/OWNER/stave/commit/3550fdae416e7e35ce7c0da8887818f73e7eb9f3))
- **message:** preserve file reference locations in markdown links ([#107](https://github.com/OWNER/stave/issues/107)) ([0db840c](https://github.com/OWNER/stave/commit/0db840c64b277a03c4ba6e2edbb6d4b3dea7a831))
- **message:** use explorer file icons in markdown links ([#105](https://github.com/OWNER/stave/issues/105)) ([2293ab4](https://github.com/OWNER/stave/commit/2293ab46730c8c985dd651fef553a7ca508a4882))
- **projects:** move repository controls into settings ([#84](https://github.com/OWNER/stave/issues/84)) ([1830c94](https://github.com/OWNER/stave/commit/1830c947c5a073231cb732f3bd89a17af910fa18))
- **shell:** align right panels with top bar ([#98](https://github.com/OWNER/stave/issues/98)) ([154082e](https://github.com/OWNER/stave/commit/154082e9822c935a396a8b6c5c0cf1f6bdbce47a))
- **shell:** raise right rail beside task tabs ([#96](https://github.com/OWNER/stave/issues/96)) ([7ee3380](https://github.com/OWNER/stave/commit/7ee3380a11bad1ab1035b5dd7ab73504b8352ee4))
- **sidebar:** account for macOS traffic lights in collapsed width ([#90](https://github.com/OWNER/stave/issues/90)) ([e0bdb68](https://github.com/OWNER/stave/commit/e0bdb680a849108331f78d416416f96db58a3817))
- **sidebar:** account for macOS traffic lights in collapsed width ([#90](https://github.com/OWNER/stave/issues/90)) ([#95](https://github.com/OWNER/stave/issues/95)) ([45294c4](https://github.com/OWNER/stave/commit/45294c4015fe45eb38ce29a1dc97d21424b6d310))
- **sidebar:** move expand button to topbar and add traffic-light clearance ([#83](https://github.com/OWNER/stave/issues/83)) ([34378c8](https://github.com/OWNER/stave/commit/34378c8d500c53d3a83905f0d168db34133b37f9))
- **topbar:** align file search to the right end ([#74](https://github.com/OWNER/stave/issues/74)) ([07a49ff](https://github.com/OWNER/stave/commit/07a49ff680f1e0bfd1106921709c743db2de808d))
- **topbar:** remove unnecessary left padding on branch selector ([#76](https://github.com/OWNER/stave/issues/76)) ([0fad597](https://github.com/OWNER/stave/commit/0fad597d07cd6960d63076e2cf9757e4a660d3f6))
- **topbar:** stabilize create pr flow ([#81](https://github.com/OWNER/stave/issues/81)) ([30d5395](https://github.com/OWNER/stave/commit/30d5395885c8032b869c54414f43f40115e8b109))
- **topbar:** use native macOS traffic-light buttons and move utility actions to sidebar ([#73](https://github.com/OWNER/stave/issues/73)) ([1199b28](https://github.com/OWNER/stave/commit/1199b2897ab32bfc2e8596a275d5850932a77162))
- **topbar:** use native macOS traffic-light buttons instead of custom controls ([#71](https://github.com/OWNER/stave/issues/71)) ([87fcebd](https://github.com/OWNER/stave/commit/87fcebd74f999e28a01377d2a6c8b4fe4b3d9d7d))
- **ui:** add app-wide tooltip provider ([ba454f9](https://github.com/OWNER/stave/commit/ba454f917a532eb5869440d2ab33da7a8fdbf793))
- **ui:** widen chat area max-width from 5xl to 6xl ([#77](https://github.com/OWNER/stave/issues/77)) ([4ff8e97](https://github.com/OWNER/stave/commit/4ff8e97bf319c64251f80e3de8d99f08badb0ba7))
- **workspacebar:** adjust tooltip positioning from right to top ([#88](https://github.com/OWNER/stave/issues/88)) ([2817c5a](https://github.com/OWNER/stave/commit/2817c5a6651c1b33f19795ac73be50a343a96169))
- **workspace:** persist project registry and recover legacy workspaces ([#94](https://github.com/OWNER/stave/issues/94)) ([9a99d2c](https://github.com/OWNER/stave/commit/9a99d2ccae83dd5e23d8def2d590387765f83b47))

## [0.0.27](https://github.com/OWNER/stave/compare/v0.0.26...v0.0.27) (2026-03-30)

### Features

- **branding:** refresh the A-1 Focused Lens logo across app and landing assets ([#64](https://github.com/OWNER/stave/issues/64)) ([4902e6d](https://github.com/OWNER/stave/commit/4902e6d12388ae7f3a2bc35b1d0449f1275113f2))

### Bug Fixes

- **compact:** remove compacting spinner once compact completes ([#66](https://github.com/OWNER/stave/issues/66)) ([5f413d2](https://github.com/OWNER/stave/commit/5f413d21de6f6277787e21a86ad5835f1d871a9f))
- improve inline auto-complete behavior ([#65](https://github.com/OWNER/stave/issues/65)) ([c3e4e74](https://github.com/OWNER/stave/commit/c3e4e743193330c0551b8db2e500ee3bce2303cd))
- **skills:** handle skill-only invocations ([#68](https://github.com/OWNER/stave/issues/68)) ([fe2694f](https://github.com/OWNER/stave/commit/fe2694fc3d81c8d553edd3c103b348f2f74bda92))

## [0.0.26](https://github.com/OWNER/stave/compare/v0.0.25...v0.0.26) (2026-03-29)

### Features

- **commands:** format stave command outputs as Markdown for rich rendering ([#43](https://github.com/OWNER/stave/issues/43)) ([ab23785](https://github.com/OWNER/stave/commit/ab2378594b054e5936196bdfafb00f1733277b12))
- **exploration:** add repo-map AI context injection and TypeScript LSP support ([#59](https://github.com/OWNER/stave/issues/59)) ([4c4ac2b](https://github.com/OWNER/stave/commit/4c4ac2bfe8aa75063cf5272fd8afd7fb7084d011))
- **exploration:** add repo-map cache and docs ([#57](https://github.com/OWNER/stave/issues/57)) ([f4f070c](https://github.com/OWNER/stave/commit/f4f070c0e0dcdd1d2f720344c49a61156fd0c068))
- **explorer:** add file and folder creation with extension icons ([#54](https://github.com/OWNER/stave/issues/54)) ([745ff54](https://github.com/OWNER/stave/commit/745ff54ae4f2f75e33d4e877aae9d27298756c40))
- **providers:** add 1M context window model variants ([#63](https://github.com/OWNER/stave/issues/63)) ([7f06b6d](https://github.com/OWNER/stave/commit/7f06b6d))
- **providers:** reflect claude and codex sdk upgrades ([#51](https://github.com/OWNER/stave/issues/51)) ([2663580](https://github.com/OWNER/stave/commit/26635806c4fae1f04d11685785e3a98fb9c351ad))
- **ui:** add checkpoint UI for compact_boundary with git-based restore ([#53](https://github.com/OWNER/stave/issues/53)) ([fa5e436](https://github.com/OWNER/stave/commit/fa5e436b7b081239c67f9c57e481cb6f43536a3c))

### Bug Fixes

- **chat:** hide modifying notice when inline diff is shown ([#56](https://github.com/OWNER/stave/issues/56)) ([920068a](https://github.com/OWNER/stave/commit/920068a2886ce8f708fde1612c0ac00c0523a24e))
- **chat:** prevent code block flickering during streaming ([#44](https://github.com/OWNER/stave/issues/44)) ([5da9fb1](https://github.com/OWNER/stave/commit/5da9fb1f04c3e84c4769a48606a516be5bb8f9c2))
- **ipc:** strip renderer-only tool metadata from provider history ([#52](https://github.com/OWNER/stave/issues/52)) ([baa4f3c](https://github.com/OWNER/stave/commit/baa4f3cf94d7f278073047ca71f2078503642894))
- **markdown:** add custom hr component to fix divider spacing ([#46](https://github.com/OWNER/stave/issues/46)) ([5231365](https://github.com/OWNER/stave/commit/5231365794af6ff2c5bea55d0b43696e4715b98a))
- **skills:** embed skill instructions in prompt and stop blocking valid commands ([#49](https://github.com/OWNER/stave/issues/49)) ([f3f4d07](https://github.com/OWNER/stave/commit/f3f4d0721ee58c5307cc6b5984f212c5a0f49965))
- **stave-auto:** harden subtask breakdown parsing ([#50](https://github.com/OWNER/stave/issues/50)) ([2981f27](https://github.com/OWNER/stave/commit/2981f27de3b59a36c8178a7600b4ab2b48302b41))
- **stave-release:** clean up temporary release worktree ([#45](https://github.com/OWNER/stave/issues/45)) ([df5090c](https://github.com/OWNER/stave/commit/df5090c66ca077e2b1f8233f15456b7b61c3937d))
- **ui:** prevent cmdk auto-selecting first item in selector palettes ([#48](https://github.com/OWNER/stave/issues/48)) ([002d3df](https://github.com/OWNER/stave/commit/002d3df76873af2769888805f99f35e65cd0f867))
- **ui:** preserve leading-7 line-height from twMerge in message blocks ([#62](https://github.com/OWNER/stave/issues/62)) ([a0728a3](https://github.com/OWNER/stave/commit/a0728a3))
- **ui:** widen sidebar resize handle and smooth collapse transition ([#58](https://github.com/OWNER/stave/issues/58)) ([8fe409a](https://github.com/OWNER/stave/commit/8fe409aa53fda8007f3106400407f23b56e2d701))
- **workspace:** align shell naming and remove legacy ui ([#55](https://github.com/OWNER/stave/issues/55)) ([23de43c](https://github.com/OWNER/stave/commit/23de43c99e876ab83cb285f070cdf208f463aeac))

## [0.0.25](https://github.com/OWNER/stave/compare/v0.0.24...v0.0.25) (2026-03-27)

### Features

- add GitHub Pages landing page for Stave ([#38](https://github.com/OWNER/stave/issues/38)) ([5887ce8](https://github.com/OWNER/stave/commit/5887ce8140bf75bc1b33abf58330fc55e0bb3037))

### Bug Fixes

- **ipc:** sanitize oversized plan approval payloads ([#39](https://github.com/OWNER/stave/issues/39)) ([8b03dd7](https://github.com/OWNER/stave/commit/8b03dd72045f73a9f1e692018e52aec8c633147c))
- **stave-auto:** suppress routing JSON when payload uses intent field ([#41](https://github.com/OWNER/stave/issues/41)) ([edec318](https://github.com/OWNER/stave/commit/edec318513a86d6c28745a6fca5cbdd0c9771977))
- **workspace:** reuse root node_modules in worktrees ([#37](https://github.com/OWNER/stave/issues/37)) ([d1aa2d8](https://github.com/OWNER/stave/commit/d1aa2d88f721bcdf6064236af4471ec640611685))

## [0.0.24](https://github.com/OWNER/stave/compare/v0.0.23...v0.0.24) (2026-03-27)

### Features

- **commands:** add /stave:sync to fetch and pull current branch ([#30](https://github.com/OWNER/stave/issues/30)) ([599d0a5](https://github.com/OWNER/stave/commit/599d0a5099075ff3dc53ba91971e84f44dd50db3))
- **subagent:** show task_progress inside SubagentCard via Hook-based agent tracking ([#35](https://github.com/OWNER/stave/issues/35)) ([828e8ce](https://github.com/OWNER/stave/commit/828e8ceacdf2f123b00c68410a99b184172cd6d6))

### Bug Fixes

- add searchable branch picker and restore long timeouts ([#27](https://github.com/OWNER/stave/issues/27)) ([2099cd9](https://github.com/OWNER/stave/commit/2099cd9ff2d160f502f0569134e6107b42c92d7e))
- **chat:** scroll to bottom when switching tasks ([#28](https://github.com/OWNER/stave/issues/28)) ([13f159e](https://github.com/OWNER/stave/commit/13f159e4cf4cc2ae8604631db14de9fcd1290766))
- improve file search layout and responsiveness ([#32](https://github.com/OWNER/stave/issues/32)) ([188964e](https://github.com/OWNER/stave/commit/188964e314d568b69bf70fd18fcac25b4a16e8f9))
- **scm:** filter stale branches from workspace creation dialog ([#26](https://github.com/OWNER/stave/issues/26)) ([fc36fb9](https://github.com/OWNER/stave/commit/fc36fb95e3d5163b586759fef50947e661608934))
- **stave:** skill fast-path bypasses preprocessor and unifies skill visibility ([#34](https://github.com/OWNER/stave/issues/34)) ([708417d](https://github.com/OWNER/stave/commit/708417d6792ea9eb45d8309621d670dc3fe22e9d))
- **topbar:** consolidate open-in actions into overflow dropdown ([#29](https://github.com/OWNER/stave/issues/29)) ([fd0c2a2](https://github.com/OWNER/stave/commit/fd0c2a2926c0beb0049c0e5d23010ba2d8e1d1c4))
- **topbar:** hide project-only UI when no project/workspace is selected ([#25](https://github.com/OWNER/stave/issues/25)) ([bf3ad22](https://github.com/OWNER/stave/commit/bf3ad22e42b96f915d6233f9c983b733216a7035))

# Changelog

## [0.0.23](https://github.com/OWNER/stave/compare/v0.0.22...v0.0.23) (2026-03-26)

### Bug Fixes

- **release:** preserve macOS framework symlinks ([#23](https://github.com/OWNER/stave/issues/23)) ([723c199](https://github.com/OWNER/stave/commit/723c199))

## [0.0.22](https://github.com/OWNER/stave/compare/v0.0.21...v0.0.22) (2026-03-26)

### Bug Fixes

- add gh-authenticated macOS installer flow ([#21](https://github.com/OWNER/stave/issues/21)) ([ed68911](https://github.com/OWNER/stave/commit/ed68911))

## [0.0.21](https://github.com/OWNER/stave/compare/v0.0.20...v0.0.21) (2026-03-26)

### Bug Fixes

- **desktop:** ship internal macOS app bundle zip ([#19](https://github.com/OWNER/stave/issues/19)) ([20ae651](https://github.com/OWNER/stave/commit/20ae651))
- wrap topbar workspace path tooltip ([#18](https://github.com/OWNER/stave/issues/18)) ([44055d8](https://github.com/OWNER/stave/commit/44055d8))
- **paths:** remove user-specific absolute paths ([#17](https://github.com/OWNER/stave/issues/17)) ([9314def](https://github.com/OWNER/stave/commit/9314def))

## [0.0.20](https://github.com/OWNER/stave/compare/v0.0.19...v0.0.20) (2026-03-26)

### Features

- allow creating workspace from remote branches ([#12](https://github.com/OWNER/stave/issues/12)) ([4bb2c7c](https://github.com/OWNER/stave/commit/4bb2c7c))
- increase provider timeout options to 30m/1h/2h/3h ([#13](https://github.com/OWNER/stave/issues/13)) ([df8ae88](https://github.com/OWNER/stave/commit/df8ae88))

### Bug Fixes

- **workspace:** clean up git worktree and branch on workspace delete ([#15](https://github.com/OWNER/stave/issues/15)) ([b7cbc13](https://github.com/OWNER/stave/commit/b7cbc13))

## [0.0.19](https://github.com/OWNER/stave/compare/v0.0.18...v0.0.19) (2026-03-26)

### Bug Fixes

- **desktop:** repair packaged runtimes and app metadata ([#10](https://github.com/OWNER/stave/issues/10)) ([69cb40e](https://github.com/OWNER/stave/commit/69cb40e6e2bb68ffccb2fbeaf8f5d9daa40b4b1b))

## [0.0.18](https://github.com/OWNER/stave/compare/v0.0.17...v0.0.18) (2026-03-26)

### Features

- add open in feature, repo level settings inc postintall ([#5](https://github.com/OWNER/stave/issues/5)) ([3459cc2](https://github.com/OWNER/stave/commit/3459cc2e13631e92ca2f9ab1074e6ebf5ec52af1))
- add top-bar file search with Cmd+P quick open ([#7](https://github.com/OWNER/stave/issues/7)) ([8f8f992](https://github.com/OWNER/stave/commit/8f8f9922d353b145d38a49a64b0ecfc628979e98))
- AI inline code completions in editor ([#10](https://github.com/OWNER/stave/issues/10)) ([ae09cd9](https://github.com/OWNER/stave/commit/ae09cd9259706034c722c3bfbc4b11b1f966a9ab))
- **claude:** upgrade SDK and set default to acceptEdits ([#7](https://github.com/OWNER/stave/issues/7)) ([20dbde8](https://github.com/OWNER/stave/commit/20dbde8c468268e49cc20a2a9b6d71bcf4b196e2))
- Cmd+W closes editor tab first, add confirmBeforeClose setting ([#6](https://github.com/OWNER/stave/issues/6)) ([b7e0928](https://github.com/OWNER/stave/commit/b7e0928ebe546ae7519d84425ecd5441b77dd6b6))
- polish dialogs and codex resume handling ([#8](https://github.com/OWNER/stave/issues/8)) ([52504e8](https://github.com/OWNER/stave/commit/52504e878a9d7f9cf147d336681e4138c4b4f1c8))
- **stave:** add orchestration runtime and processing UI ([#3](https://github.com/OWNER/stave/issues/3)) ([4c8c4fb](https://github.com/OWNER/stave/commit/4c8c4fbcf7114cffaafb06bf61ecd5fb79ed4203))
- **stave:** redesign auto routing and orchestration ([#4](https://github.com/OWNER/stave/issues/4)) ([82b9216](https://github.com/OWNER/stave/commit/82b921650ad4c3393c61c73670e40c27bdb8affe))
- window maximize, Stave Auto presets & fast mode, responsive file search, task title filters ([2dd92c0](https://github.com/OWNER/stave/commit/2dd92c06da286ad65b858b588b038cf9990f830f))

### Bug Fixes

- add ~/.claude/local to CLI path resolution ([#2](https://github.com/OWNER/stave/issues/2)) ([33189cd](https://github.com/OWNER/stave/commit/33189cded69170f87d529bf517b830ed25213b56))
- harden better-sqlite3 Electron ABI compatibility and install workflow ([#3](https://github.com/OWNER/stave/issues/3)) ([97296c8](https://github.com/OWNER/stave/commit/97296c889e8d04496a0f8ab12cc027dd75598b97))
- keyboard shortcuts drawer full-height background ([#8](https://github.com/OWNER/stave/issues/8)) ([2c918c5](https://github.com/OWNER/stave/commit/2c918c514c8def6cbf6ef68ee322f85686c062d7))
- stave-worktree-pr-flow not create another worktree ([#6](https://github.com/OWNER/stave/issues/6)) ([3b08c0b](https://github.com/OWNER/stave/commit/3b08c0b743ae20a8e4629445107929821b5c7776))
- **ui:** restore provider wave indicator tones ([#9](https://github.com/OWNER/stave/issues/9)) ([ab4cb5b](https://github.com/OWNER/stave/commit/ab4cb5bc8019fed7c05919aeb0b8ff73e74ca736))
- update better-sqlite3 Electron patch for v12.6.2 ([#2](https://github.com/OWNER/stave/issues/2)) ([f6593b7](https://github.com/OWNER/stave/commit/f6593b7761a6859526a7d070c276a17c4daf8dca))
- **workspace:** preserve existing DB data when localStorage is cleared ([40009c6](https://github.com/OWNER/stave/commit/40009c620ec777b9a709713de6b48f0c308b97f3))

## [0.0.17](https://github.com/astyfx/stave/compare/v0.0.16...v0.0.17) (2026-03-25)

### Highlights

- fixed a release-blocking provider turn type mismatch by centralizing shared `ProviderRuntimeOptions` across renderer, preload, Electron runtime, and the dev bridge
- added strict IPC schema support for `staveRouteModels`, so Stave router model overrides are accepted end-to-end instead of failing type or runtime validation
- reduced duplicated provider runtime contract declarations, lowering the chance that future Claude, Codex, or Stave option additions drift across the app boundary

## [0.0.15](https://github.com/astyfx/stave/compare/v0.0.14...v0.0.15) (2026-03-24)

### Highlights

- upgraded the bundled Claude and Codex SDK integrations to `@anthropic-ai/claude-agent-sdk` `0.2.81` and `@openai/codex-sdk` `0.116.0`, and wired both runtimes through the app's typed IPC/runtime option contracts
- added provider-aware Fast mode controls so Claude `/fast` and Codex `features.fast_mode` can be toggled from the composer, shown or hidden from Chat settings, and managed independently in Provider settings
- expanded the composer attachment flow with clipboard image paste support, plus refreshed the docs index and README to surface the new attachments guide
- refined workspace and top-bar ergonomics with branch badges on default workspaces, a compact new-task affordance in task tabs, safer workspace close loading states, and dedicated branch/Open PR top-bar actions
- cleaned up the chat and editor surfaces by removing the floating conversation export button, improving auto-scroll stickiness, simplifying panel chrome, and making SCM commit actions easier to reach
- hardened filesystem traversal against unreadable system directories so recursive scans and folder listings skip permission errors instead of failing the UI

## [0.0.14](https://github.com/astyfx/stave/compare/v0.0.13...v0.0.14) (2026-03-24)

### Features

- auto-import existing git worktrees ([64c9760](https://github.com/astyfx/stave/commit/64c9760bc3933a16a640b45fce645efdb99438ac))

### Bug Fixes

- hide macos native window buttons ([2ed7b84](https://github.com/astyfx/stave/commit/2ed7b846192a0ca3490b972bcabab9f8ac139e99))
- run packaged desktop build on macos ([0422e21](https://github.com/astyfx/stave/commit/0422e21d2d80d831e33b2be37238aa0e04934803))

### Highlights

- redesigned the main shell around a collapsible project-and-workspace sidebar, per-workspace task tabs, and a right-side activity rail with stable manual ordering controls
- kept inactive workspace sessions alive while switching context by caching workspace runtime state and replaying provider events back into the owning workspace instead of interrupting live turns
- added `$skill-name` discovery and insertion in the composer, plus provider-aware skill dispatch that resolves installed Claude and Codex skills from global, user, and workspace roots
- taught the explorer and workspace open flows to resolve arbitrary folder paths, lazy-load directory entries, keep empty folders visible, and reuse cached directory listings until refresh
- refreshed release-facing docs for the new shell and skill selector, and upgraded the renderer toolchain around Vite 8, `@vitejs/plugin-react` 6, and the new drag-and-drop sidebar dependencies

## [0.0.13](https://github.com/astyfx/stave/compare/v0.0.12...v0.0.13) (2026-03-20)

### Highlights

- preserved each selected project's own workspace list and last active workspace instead of resetting the app to a single global project state
- added recent-project reopening in the top-bar project menu so switching back to an earlier folder restores that project's remembered workspace metadata
- scoped default workspace identities to each project path and added regression coverage for the project A -> project B -> reopen project A flow

## [0.0.12](https://github.com/astyfx/stave/compare/v0.0.11...v0.0.12) (2026-03-20)

### Bug Fixes

- stabilize electron native rebuild scripts ([d1cd758](https://github.com/astyfx/stave/commit/d1cd758743cfad7c3efc9be552778f6d0dc75ca8))
- validate filesystem IPC path inputs ([b661ab4](https://github.com/astyfx/stave/commit/b661ab429fc55bd7d7dfc4234b00d9fd6c7cb155))

### Highlights

- stabilized Electron native rebuilds by resolving script paths from `import.meta.url` and caching Electron headers under the repo-local `.cache/node-gyp/` directory
- hardened filesystem IPC and workspace file loaders so missing `rootPath` or `filePath` values return descriptive failures instead of raw Node `path` exceptions
- aligned browser and Electron file explorers to keep hidden files such as `.env` visible while still skipping ignored directories like `.git`, `node_modules`, `dist`, and `out`

## [0.0.11](https://github.com/astyfx/stave/compare/v0.0.10...v0.0.11) (2026-03-20)

### Highlights

- fixed the Electron 41 `better-sqlite3` patch flow by scoping `HolderV2()` replacements to getter blocks that actually use `PropertyCallbackInfo`
- added a single Electron native dependency rebuild entrypoint that resolves the current Electron version and host architecture before rebuilding `better-sqlite3` and `node-pty`
- made packaged desktop runs and built local desktop runs rebuild Electron native modules automatically before bundling or launching
- added regression coverage for the patch scope and packaging script wiring, and refreshed the desktop packaging README to document the safer rebuild workflow

## [0.0.10](https://github.com/astyfx/stave/compare/v0.0.9...v0.0.10) (2026-03-20)

### Features

- add typed attachment model with screenshot capture and image viewer ([b686358](https://github.com/astyfx/stave/commit/b6863588fc99890638d45ab44fcfcffea38542fd))
- align codex runtime with sdk 0.115.0 ([00176b3](https://github.com/astyfx/stave/commit/00176b38b66da85d62513200957b6b6b515cfec5))
- improve chat context handling and replay diagnostics ([e2c2610](https://github.com/astyfx/stave/commit/e2c26107e4bae37aa9c58f59a0818fe872883583))
- polish composer and panel controls ([593e773](https://github.com/astyfx/stave/commit/593e7735d54de41d3a0bdcfbc93bbd8ea646afb9))
- run init commands for new workspaces ([bf8e0d8](https://github.com/astyfx/stave/commit/bf8e0d80d8a4d28fcfae28e519483ebf33198c4d))
- surface compact boundary, compacting status, and tool progress ([a3b1cab](https://github.com/astyfx/stave/commit/a3b1cab36b66869b50acc499997e3f33fbfba00b))
- update supported provider model catalog ([5e2fe28](https://github.com/astyfx/stave/commit/5e2fe2897ddc4566ba91f26cabab86c64f883a02))

### Bug Fixes

- add tool_progress case to exhaustive switch statements ([208b050](https://github.com/astyfx/stave/commit/208b050bc6c9e10906f9533372fcae0e98f481c7))
- honor collapsed reasoning setting while streaming ([406a6be](https://github.com/astyfx/stave/commit/406a6bedbfa473143d4c4874819f818d583b766a))
- polish replay icons and diff overflow ([2f845f2](https://github.com/astyfx/stave/commit/2f845f2f5af03488b560a90fe5de72ee5483fcc9))

### Highlights

- added typed file attachments across the chat workspace, including screenshot capture, image viewing, and richer attachment rendering for prompt drafts
- added optional post-create workspace init commands so new git workspaces can bootstrap themselves with setup steps such as dependency installs
- expanded replay and diagnostics coverage with compact boundary visibility, compacting and tool-progress status, and deeper request-context inspection
- refreshed the shell and composer UX with a dropdown app menu, cleaner panel controls, generic suggestion primitives, and replay/diff polish
- updated the Codex runtime integration for SDK `0.115.0`, refreshed the supported model catalog, and aligned provider runtime docs with the shipped behavior
- simplified persistence internals before release by removing legacy workspace snapshot/runtime migration paths and standardizing draft attachments on multi-file path arrays

## [0.0.9](https://github.com/astyfx/stave/compare/v0.0.8...v0.0.9) (2026-03-12)

### Features

- add Monaco workspace language intelligence ([f42f735](https://github.com/astyfx/stave/commit/f42f7354ff65a17e42dba6cde5c042396a6f3354))

### Highlights

- added workspace-backed Monaco language intelligence for TypeScript and JavaScript by loading the active workspace `tsconfig.json`, source files, and type libraries into the editor worker
- added an Electron-managed Python LSP path so Monaco can request hover, completion, definition, and diagnostics through stdio-backed language-server sessions
- added provider runtime controls and status lines under the chat composer, including inline Claude/Codex runtime visibility plus Claude agent progress summaries rendered from `task_progress.summary`
- refreshed Claude and Codex runtime settings around effort, thinking, web search, raw reasoning, and future Claude SDK candidates, with updated provider runtime documentation
- fixed desktop native module compatibility for Electron 41 by rebuilding `better-sqlite3` and `node-pty` against the current runtime ABI and automating the `better-sqlite3` patch step in the rebuild workflow

## [0.0.8](https://github.com/astyfx/stave/compare/v0.0.7...v0.0.8) (2026-03-11)

### Bug Fixes

- stabilize diff editor panels and controls ([ae0294b](https://github.com/astyfx/stave/commit/ae0294b4ef7740bccd6a9f111c1212b74f948d0c))

### Performance Improvements

- narrow layout state subscriptions ([4f22dcf](https://github.com/astyfx/stave/commit/4f22dcf3f4406b865ed28dcf80933b7d4f241d61))
- optimize terminal dock updates ([4dc6fda](https://github.com/astyfx/stave/commit/4dc6fda7803fe5003c61b730e269740640d92226))

### Highlights

- stabilized SCM diff tabs so repeated opens and tab switches keep added/removed markers aligned with the real before/after workspace content
- simplified source-control review by removing the redundant inline diff preview, keeping diff controls in the editor, and preserving healthier panel sizing and tab scrolling behavior
- reduced terminal dock overhead by batching output writes, transcript persistence, resize handling, and session polling work
- narrowed Zustand subscriptions across the app shell, top bar, task list, and session surfaces by extracting memoized layout components and moving list-local state down to the components that use it

## [0.0.7](https://github.com/astyfx/stave/compare/v0.0.6...v0.0.7) (2026-03-11)

### Features

- add session replay drawer foundation ([8fc9293](https://github.com/astyfx/stave/commit/8fc9293f0dbaf05e0f212432a4e3cb3af470b4db))
- complete session replay workbench ([844a7e6](https://github.com/astyfx/stave/commit/844a7e650ec08cbc42089146b3232567d5a83673))
- improve rendering performance and workspace UX ([56ab728](https://github.com/astyfx/stave/commit/56ab728630e427e5aafa13d6e03103c36c4919bc))
- move generic tool logs into session replay ([2e3e0af](https://github.com/astyfx/stave/commit/2e3e0af5d4cfb57556a5c05e8c4ede33a5ae4de3))
- refresh ui primitives and add gpu diagnostics ([35d7835](https://github.com/astyfx/stave/commit/35d7835abd323d77387cb4b24c259e01c2370fac))

### Highlights

- moved generic background tool activity out of the main transcript into a Session Replay drawer with recent-turn navigation, replay filters, overview metrics, and chat deep links
- reduced renderer churn across chat, editor, and layout surfaces with narrower subscriptions, guarded store writes, deferred Monaco workspace loading, and an opt-in render profiler
- improved workspace startup and source-control behavior by hydrating Explorer files on open, filtering out worktree-owned branches in the selector, and surfacing checkout failures more clearly
- refreshed translucent shadcn menu primitives and developer diagnostics, including GPU acceleration status in Settings and updated preset metadata in the docs

## [0.0.6](https://github.com/astyfx/stave/compare/v0.0.5...v0.0.6) (2026-03-10)

- reworked provider turn execution around canonical conversation requests, runtime-side request translators, and persisted per-turn request snapshots so Claude and Codex can share one task chat model more reliably
- fixed provider concurrency by scoping abort, approval, and user-input responders to individual turn ids instead of a single active slot per provider
- centralized provider model metadata, availability, native command handling, and session labeling to reduce hardcoded Claude/Codex branching and make later provider additions cheaper
- kept Claude's dedicated plan viewer but removed the Stave-managed Codex plan parser and plan mode so Codex now streams plain responses directly into the shared chat surface
- expanded the latest-turn diagnostics UI with provider session ids, persisted event timelines, and request snapshot inspection, and added surrounding shell polish such as the keyboard shortcuts drawer

## 0.0.5 - 2026-03-10

- fixed chat markdown tables so GFM pipe-table syntax renders as actual table markup instead of plain text in assistant messages
- moved message markdown rendering into a dedicated renderer with `remark-gfm` support and regression coverage for table output
- switched markdown tables onto the shared shadcn table primitives and forced long cell content to wrap within the message bubble instead of causing horizontal overflow

## 0.0.4 - 2026-03-10

- fixed Claude workspace path anchoring so relative paths like `./docs` stay rooted in the active Stave workspace instead of drifting to guessed sibling directories
- hardened Claude tool approval and user-input permission responses to always return SDK-safe payloads, preventing the recurring `updatedInput`/`message` Zod failure seen in archived sessions
- added regression coverage for Claude approval payloads, user-input payloads, and workspace-root system prompt composition

## 0.0.3 - 2026-03-09

- simplified branding to plain `Stave`, including the window title, app title, and persisted app store key
- refined chat UI with grouped file review blocks, tool/header polish, larger message typography, task timestamp display, and tooltip cleanup
- improved workspace and project menus by moving them onto the shared dropdown primitives and adding session-id access from the task menu
- tightened settings and task list UX with reduced rerender pressure, cleaner workspace identity styling, and updated menu surfaces

## 0.0.2 - 2026-03-09

- added persisted provider runtime settings and bridge updates for Codex and Claude execution controls
- improved chat message rendering with grouped changed-files and referenced-files blocks, better diff restore behavior, and highlighted file previews
- refined editor and workspace shell UX with clearer diff handling, shared workspace identity accents, and unified tooltip usage
- rebuilt the settings dialog into section-based panels with narrower rerenders and preset-aligned inverted dropdown and tooltip surfaces

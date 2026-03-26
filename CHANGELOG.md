# Changelog

## [0.0.20](https://github.com/sendbird-playground/stave/compare/v0.0.19...v0.0.20) (2026-03-26)

### Features

* allow creating workspace from remote branches ([#12](https://github.com/sendbird-playground/stave/issues/12)) ([4bb2c7c](https://github.com/sendbird-playground/stave/commit/4bb2c7c))
* increase provider timeout options to 30m/1h/2h/3h ([#13](https://github.com/sendbird-playground/stave/issues/13)) ([df8ae88](https://github.com/sendbird-playground/stave/commit/df8ae88))

### Bug Fixes

* **workspace:** clean up git worktree and branch on workspace delete ([#15](https://github.com/sendbird-playground/stave/issues/15)) ([b7cbc13](https://github.com/sendbird-playground/stave/commit/b7cbc13))

## [0.0.19](https://github.com/sendbird-playground/stave/compare/v0.0.18...v0.0.19) (2026-03-26)

### Bug Fixes

* **desktop:** repair packaged runtimes and app metadata ([#10](https://github.com/sendbird-playground/stave/issues/10)) ([69cb40e](https://github.com/sendbird-playground/stave/commit/69cb40e6e2bb68ffccb2fbeaf8f5d9daa40b4b1b))

## [0.0.18](https://github.com/sendbird-playground/stave/compare/v0.0.17...v0.0.18) (2026-03-26)

### Features

* add open in feature, repo level settings inc postintall ([#5](https://github.com/sendbird-playground/stave/issues/5)) ([3459cc2](https://github.com/sendbird-playground/stave/commit/3459cc2e13631e92ca2f9ab1074e6ebf5ec52af1))
* add top-bar file search with Cmd+P quick open ([#7](https://github.com/sendbird-playground/stave/issues/7)) ([8f8f992](https://github.com/sendbird-playground/stave/commit/8f8f9922d353b145d38a49a64b0ecfc628979e98))
* AI inline code completions in editor ([#10](https://github.com/sendbird-playground/stave/issues/10)) ([ae09cd9](https://github.com/sendbird-playground/stave/commit/ae09cd9259706034c722c3bfbc4b11b1f966a9ab))
* **claude:** upgrade SDK and set default to acceptEdits ([#7](https://github.com/sendbird-playground/stave/issues/7)) ([20dbde8](https://github.com/sendbird-playground/stave/commit/20dbde8c468268e49cc20a2a9b6d71bcf4b196e2))
* Cmd+W closes editor tab first, add confirmBeforeClose setting ([#6](https://github.com/sendbird-playground/stave/issues/6)) ([b7e0928](https://github.com/sendbird-playground/stave/commit/b7e0928ebe546ae7519d84425ecd5441b77dd6b6))
* polish dialogs and codex resume handling ([#8](https://github.com/sendbird-playground/stave/issues/8)) ([52504e8](https://github.com/sendbird-playground/stave/commit/52504e878a9d7f9cf147d336681e4138c4b4f1c8))
* **stave:** add orchestration runtime and processing UI ([#3](https://github.com/sendbird-playground/stave/issues/3)) ([4c8c4fb](https://github.com/sendbird-playground/stave/commit/4c8c4fbcf7114cffaafb06bf61ecd5fb79ed4203))
* **stave:** redesign auto routing and orchestration ([#4](https://github.com/sendbird-playground/stave/issues/4)) ([82b9216](https://github.com/sendbird-playground/stave/commit/82b921650ad4c3393c61c73670e40c27bdb8affe))
* window maximize, Stave Auto presets & fast mode, responsive file search, task title filters ([2dd92c0](https://github.com/sendbird-playground/stave/commit/2dd92c06da286ad65b858b588b038cf9990f830f))

### Bug Fixes

* add ~/.claude/local to CLI path resolution ([#2](https://github.com/sendbird-playground/stave/issues/2)) ([33189cd](https://github.com/sendbird-playground/stave/commit/33189cded69170f87d529bf517b830ed25213b56))
* harden better-sqlite3 Electron ABI compatibility and install workflow ([#3](https://github.com/sendbird-playground/stave/issues/3)) ([97296c8](https://github.com/sendbird-playground/stave/commit/97296c889e8d04496a0f8ab12cc027dd75598b97))
* keyboard shortcuts drawer full-height background ([#8](https://github.com/sendbird-playground/stave/issues/8)) ([2c918c5](https://github.com/sendbird-playground/stave/commit/2c918c514c8def6cbf6ef68ee322f85686c062d7))
* stave-worktree-pr-flow not create another worktree ([#6](https://github.com/sendbird-playground/stave/issues/6)) ([3b08c0b](https://github.com/sendbird-playground/stave/commit/3b08c0b743ae20a8e4629445107929821b5c7776))
* **ui:** restore provider wave indicator tones ([#9](https://github.com/sendbird-playground/stave/issues/9)) ([ab4cb5b](https://github.com/sendbird-playground/stave/commit/ab4cb5bc8019fed7c05919aeb0b8ff73e74ca736))
* update better-sqlite3 Electron patch for v12.6.2 ([#2](https://github.com/sendbird-playground/stave/issues/2)) ([f6593b7](https://github.com/sendbird-playground/stave/commit/f6593b7761a6859526a7d070c276a17c4daf8dca))
* **workspace:** preserve existing DB data when localStorage is cleared ([40009c6](https://github.com/sendbird-playground/stave/commit/40009c620ec777b9a709713de6b48f0c308b97f3))

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

* auto-import existing git worktrees ([64c9760](https://github.com/astyfx/stave/commit/64c9760bc3933a16a640b45fce645efdb99438ac))

### Bug Fixes

* hide macos native window buttons ([2ed7b84](https://github.com/astyfx/stave/commit/2ed7b846192a0ca3490b972bcabab9f8ac139e99))
* run packaged desktop build on macos ([0422e21](https://github.com/astyfx/stave/commit/0422e21d2d80d831e33b2be37238aa0e04934803))

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

* stabilize electron native rebuild scripts ([d1cd758](https://github.com/astyfx/stave/commit/d1cd758743cfad7c3efc9be552778f6d0dc75ca8))
* validate filesystem IPC path inputs ([b661ab4](https://github.com/astyfx/stave/commit/b661ab429fc55bd7d7dfc4234b00d9fd6c7cb155))

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

* add typed attachment model with screenshot capture and image viewer ([b686358](https://github.com/astyfx/stave/commit/b6863588fc99890638d45ab44fcfcffea38542fd))
* align codex runtime with sdk 0.115.0 ([00176b3](https://github.com/astyfx/stave/commit/00176b38b66da85d62513200957b6b6b515cfec5))
* improve chat context handling and replay diagnostics ([e2c2610](https://github.com/astyfx/stave/commit/e2c26107e4bae37aa9c58f59a0818fe872883583))
* polish composer and panel controls ([593e773](https://github.com/astyfx/stave/commit/593e7735d54de41d3a0bdcfbc93bbd8ea646afb9))
* run init commands for new workspaces ([bf8e0d8](https://github.com/astyfx/stave/commit/bf8e0d80d8a4d28fcfae28e519483ebf33198c4d))
* surface compact boundary, compacting status, and tool progress ([a3b1cab](https://github.com/astyfx/stave/commit/a3b1cab36b66869b50acc499997e3f33fbfba00b))
* update supported provider model catalog ([5e2fe28](https://github.com/astyfx/stave/commit/5e2fe2897ddc4566ba91f26cabab86c64f883a02))

### Bug Fixes

* add tool_progress case to exhaustive switch statements ([208b050](https://github.com/astyfx/stave/commit/208b050bc6c9e10906f9533372fcae0e98f481c7))
* honor collapsed reasoning setting while streaming ([406a6be](https://github.com/astyfx/stave/commit/406a6bedbfa473143d4c4874819f818d583b766a))
* polish replay icons and diff overflow ([2f845f2](https://github.com/astyfx/stave/commit/2f845f2f5af03488b560a90fe5de72ee5483fcc9))

### Highlights

- added typed file attachments across the chat workspace, including screenshot capture, image viewing, and richer attachment rendering for prompt drafts
- added optional post-create workspace init commands so new git workspaces can bootstrap themselves with setup steps such as dependency installs
- expanded replay and diagnostics coverage with compact boundary visibility, compacting and tool-progress status, and deeper request-context inspection
- refreshed the shell and composer UX with a dropdown app menu, cleaner panel controls, generic suggestion primitives, and replay/diff polish
- updated the Codex runtime integration for SDK `0.115.0`, refreshed the supported model catalog, and aligned provider runtime docs with the shipped behavior
- simplified persistence internals before release by removing legacy workspace snapshot/runtime migration paths and standardizing draft attachments on multi-file path arrays

## [0.0.9](https://github.com/astyfx/stave/compare/v0.0.8...v0.0.9) (2026-03-12)

### Features

* add Monaco workspace language intelligence ([f42f735](https://github.com/astyfx/stave/commit/f42f7354ff65a17e42dba6cde5c042396a6f3354))

### Highlights

- added workspace-backed Monaco language intelligence for TypeScript and JavaScript by loading the active workspace `tsconfig.json`, source files, and type libraries into the editor worker
- added an Electron-managed Python LSP path so Monaco can request hover, completion, definition, and diagnostics through stdio-backed language-server sessions
- added provider runtime controls and status lines under the chat composer, including inline Claude/Codex runtime visibility plus Claude agent progress summaries rendered from `task_progress.summary`
- refreshed Claude and Codex runtime settings around effort, thinking, web search, raw reasoning, and future Claude SDK candidates, with updated provider runtime documentation
- fixed desktop native module compatibility for Electron 41 by rebuilding `better-sqlite3` and `node-pty` against the current runtime ABI and automating the `better-sqlite3` patch step in the rebuild workflow

## [0.0.8](https://github.com/astyfx/stave/compare/v0.0.7...v0.0.8) (2026-03-11)

### Bug Fixes

* stabilize diff editor panels and controls ([ae0294b](https://github.com/astyfx/stave/commit/ae0294b4ef7740bccd6a9f111c1212b74f948d0c))

### Performance Improvements

* narrow layout state subscriptions ([4f22dcf](https://github.com/astyfx/stave/commit/4f22dcf3f4406b865ed28dcf80933b7d4f241d61))
* optimize terminal dock updates ([4dc6fda](https://github.com/astyfx/stave/commit/4dc6fda7803fe5003c61b730e269740640d92226))

### Highlights

- stabilized SCM diff tabs so repeated opens and tab switches keep added/removed markers aligned with the real before/after workspace content
- simplified source-control review by removing the redundant inline diff preview, keeping diff controls in the editor, and preserving healthier panel sizing and tab scrolling behavior
- reduced terminal dock overhead by batching output writes, transcript persistence, resize handling, and session polling work
- narrowed Zustand subscriptions across the app shell, top bar, task list, and session surfaces by extracting memoized layout components and moving list-local state down to the components that use it

## [0.0.7](https://github.com/astyfx/stave/compare/v0.0.6...v0.0.7) (2026-03-11)

### Features

* add session replay drawer foundation ([8fc9293](https://github.com/astyfx/stave/commit/8fc9293f0dbaf05e0f212432a4e3cb3af470b4db))
* complete session replay workbench ([844a7e6](https://github.com/astyfx/stave/commit/844a7e650ec08cbc42089146b3232567d5a83673))
* improve rendering performance and workspace UX ([56ab728](https://github.com/astyfx/stave/commit/56ab728630e427e5aafa13d6e03103c36c4919bc))
* move generic tool logs into session replay ([2e3e0af](https://github.com/astyfx/stave/commit/2e3e0af5d4cfb57556a5c05e8c4ede33a5ae4de3))
* refresh ui primitives and add gpu diagnostics ([35d7835](https://github.com/astyfx/stave/commit/35d7835abd323d77387cb4b24c259e01c2370fac))

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

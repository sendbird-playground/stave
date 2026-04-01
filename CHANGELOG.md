## [0.0.31](https://github.com/sendbird-playground/stave/compare/v0.0.30...v0.0.31) (2026-04-01)

### Features

* add task auto-approval and improve plan history UI ([#158](https://github.com/sendbird-playground/stave/issues/158)) ([f60f361](https://github.com/sendbird-playground/stave/commit/f60f361a6f4e7b94696e7cf382dd110e9b3e744d))
* **codex:** enforce read-only sandbox for plan mode ([#154](https://github.com/sendbird-playground/stave/issues/154)) ([2693bb8](https://github.com/sendbird-playground/stave/commit/2693bb8f91519a79a822e93990922ec9e357005f))
* handle notifications for archived tasks ([#153](https://github.com/sendbird-playground/stave/issues/153)) ([ccbe5de](https://github.com/sendbird-playground/stave/commit/ccbe5de79d76ffe42fe838848cc899b8b18aac03))
* **local-mcp:** add paginated browsing with lazy payload loading ([#160](https://github.com/sendbird-playground/stave/issues/160)) ([30caacf](https://github.com/sendbird-playground/stave/commit/30caacf7b976cdd4691947b34100d43c0c46328e))
* **plan-viewer:** respond to input dock height changes ([#155](https://github.com/sendbird-playground/stave/issues/155)) ([4fb089c](https://github.com/sendbird-playground/stave/commit/4fb089cd30c3cd1982426cfac6dec0e426cb03bc))
* **workspace:** add workspace information panel ([#157](https://github.com/sendbird-playground/stave/issues/157)) ([1d3dafb](https://github.com/sendbird-playground/stave/commit/1d3dafbe5e2ac824199ff6b87f982c498d62507e))

### Bug Fixes

* **chat:** stabilize zustand selector snapshots ([#152](https://github.com/sendbird-playground/stave/issues/152)) ([75e2434](https://github.com/sendbird-playground/stave/commit/75e24345b47ac20addb349147fca5c7af26d7418))
## [0.0.30](https://github.com/sendbird-playground/stave/compare/v0.0.29...v0.0.30) (2026-04-01)

### Features

* **settings:** add native tooling diagnostics ([#149](https://github.com/sendbird-playground/stave/issues/149)) ([6222b37](https://github.com/sendbird-playground/stave/commit/6222b37de0b3931a0a2fc94e1eb8723aef825851))
* **theme:** add matching light theme presets ([#150](https://github.com/sendbird-playground/stave/issues/150)) ([a8a5308](https://github.com/sendbird-playground/stave/commit/a8a5308b64c590f09c3d190d9d6b908a8a9526a2))

### Bug Fixes

* stabilize workspace turns and gh lookup ([#148](https://github.com/sendbird-playground/stave/issues/148)) ([af87f75](https://github.com/sendbird-playground/stave/commit/af87f755a15caa8ed7964e464f74ceb57d8da1b1))
## [0.0.29](https://github.com/sendbird-playground/stave/compare/v0.0.28...v0.0.29) (2026-03-31)

### Features

* add ESLint formatter and format-on-save shortcut ([#133](https://github.com/sendbird-playground/stave/issues/133)) ([487072b](https://github.com/sendbird-playground/stave/commit/487072b06f7dce9e28c4fe7676def7fc580c35f4))
* add local packaged-app MCP automation surface ([#123](https://github.com/sendbird-playground/stave/issues/123)) ([e6b5c39](https://github.com/sendbird-playground/stave/commit/e6b5c39fe50645384c8e49b5e7dc4ad0f3f5ebbc))
* add stave-design-system skill and workflow documentation ([#126](https://github.com/sendbird-playground/stave/issues/126)) ([c5f2f99](https://github.com/sendbird-playground/stave/commit/c5f2f998d68001b29e7891c64b539c0190a25b05))
* add workspace refresh feature ([#132](https://github.com/sendbird-playground/stave/issues/132)) ([2ec6ae8](https://github.com/sendbird-playground/stave/commit/2ec6ae85f0c2c3c943fa713f7b997e39fc0f3947))
* **auto-update:** add automatic daily updates ([#136](https://github.com/sendbird-playground/stave/issues/136)) ([5d92355](https://github.com/sendbird-playground/stave/commit/5d9235528ad312c739a92331c8ea58e9b5cdf03b))
* **filesystem:** show external symlinks in explorer ([#143](https://github.com/sendbird-playground/stave/issues/143)) ([c349f41](https://github.com/sendbird-playground/stave/commit/c349f41715b50147423569d59bd1d4de172883a0))
* implement Codex native plan-mode support ([#116](https://github.com/sendbird-playground/stave/issues/116)) ([ac27d1d](https://github.com/sendbird-playground/stave/commit/ac27d1d4931c4d78324c12e896308db17e9bacbf))
* **local-mcp:** add inbound request log viewer ([#128](https://github.com/sendbird-playground/stave/issues/128)) ([5501ede](https://github.com/sendbird-playground/stave/commit/5501ede86d8e09d26723c9cf8ae4fbf7d97e525d))
* **notifications:** add configurable notification sounds ([#113](https://github.com/sendbird-playground/stave/issues/113)) ([db5844e](https://github.com/sendbird-playground/stave/commit/db5844e84dfb8c908eaa954c7557e0c2eea0c968))
* **notifications:** add custom audio file upload for notification sound ([e48c361](https://github.com/sendbird-playground/stave/commit/e48c36149ab2b95824b70fac1ddfc20c97b1cc14))
* **notifications:** add harvest notification preset ([#127](https://github.com/sendbird-playground/stave/issues/127)) ([dd878d8](https://github.com/sendbird-playground/stave/commit/dd878d8c0f4f61a687d886a8eb6cc52cc65a1d85))
* **plan:** add auto-approve setting for plan mode ([#135](https://github.com/sendbird-playground/stave/issues/135)) ([78c90ae](https://github.com/sendbird-playground/stave/commit/78c90ae7607063aa67a1cf7d114e31d658956a6b))
* **theme:** implement comprehensive theme system ([#139](https://github.com/sendbird-playground/stave/issues/139)) ([608869e](https://github.com/sendbird-playground/stave/commit/608869e6ae2963086fb42fc2ff98d6ba87dbced4))

### Bug Fixes

* **DFE-2508:** fix infinite re-render loop when creating new task tab ([#124](https://github.com/sendbird-playground/stave/issues/124)) ([4b3a2ce](https://github.com/sendbird-playground/stave/commit/4b3a2cecc2373bcfed33d88f8c34bb61062ec8ca))
* **editor:** increase tab strip vertical padding ([#130](https://github.com/sendbird-playground/stave/issues/130)) ([7e45b1d](https://github.com/sendbird-playground/stave/commit/7e45b1d9b927e8d17949c89264b0a69ab7d58000))
* **filesystem:** handle symlinks with cycle and boundary checks ([#115](https://github.com/sendbird-playground/stave/issues/115)) ([61bff08](https://github.com/sendbird-playground/stave/commit/61bff089b1c23be14cc329671149892ec32d1349))
* **layout:** prevent task tabs from stretching to full width ([#129](https://github.com/sendbird-playground/stave/issues/129)) ([e5adf7a](https://github.com/sendbird-playground/stave/commit/e5adf7a21b18079dd9dd755e02e4db89e746397a))
* **mcp:** handle managed tasks in the desktop ui ([#142](https://github.com/sendbird-playground/stave/issues/142)) ([d79dca4](https://github.com/sendbird-playground/stave/commit/d79dca4c3d45527f233e58b16954b36274de1217))
* **scm:** deduplicate check runs by name to avoid stale failures ([#141](https://github.com/sendbird-playground/stave/issues/141)) ([9069fff](https://github.com/sendbird-playground/stave/commit/9069fffa37860790854264b6b272e59388d28479))
* **TopBar:** add key prop to TopBarOpenPR for workspace changes ([#119](https://github.com/sendbird-playground/stave/issues/119)) ([f059efe](https://github.com/sendbird-playground/stave/commit/f059efef86bc2fa6d06b08b35341f863e4243f6d))
* **ui:** prevent tooltip overflow ([#145](https://github.com/sendbird-playground/stave/issues/145)) ([388d7f3](https://github.com/sendbird-playground/stave/commit/388d7f347307e1b067966b9a09c7faf4d8703a41))
* use createPortal for modals and fixed positioning ([#137](https://github.com/sendbird-playground/stave/issues/137)) ([6ebcaf1](https://github.com/sendbird-playground/stave/commit/6ebcaf1bed154dca4de16d67664626f3222d1b74))
* **workspace:** harden project integrity boundaries ([#144](https://github.com/sendbird-playground/stave/issues/144)) ([208bafd](https://github.com/sendbird-playground/stave/commit/208bafd1a4655d7d182fe59818524033ee84807c))

## [0.0.28](https://github.com/sendbird-playground/stave/compare/v0.0.27...v0.0.28) (2026-03-30)

### Features

* **create-pr:** normalize PR titles against commit history ([#92](https://github.com/sendbird-playground/stave/issues/92)) ([15c31bd](https://github.com/sendbird-playground/stave/commit/15c31bde89be1ea8d6ca4e478d4156ad8a49f405))
* display PR status for non-default workspaces ([#101](https://github.com/sendbird-playground/stave/issues/101)) ([07dd5ca](https://github.com/sendbird-playground/stave/commit/07dd5ca9fed21f21867ea415547d730b9ff30f7a))
* **editor:** display full file path between tab strip and code editor ([#82](https://github.com/sendbird-playground/stave/issues/82)) ([68a9a82](https://github.com/sendbird-playground/stave/commit/68a9a826338275cda1def28acf25a01007b89f3d))
* **electron:** add Stave app icon ([#72](https://github.com/sendbird-playground/stave/issues/72)) ([622adaa](https://github.com/sendbird-playground/stave/commit/622adaa454bc668ff79e9a68eeea3bf43961b7cc))
* **logo:** add stave-auto icon with orange/green/blue color mix ([#110](https://github.com/sendbird-playground/stave/issues/110)) ([c310c0a](https://github.com/sendbird-playground/stave/commit/c310c0a9493017322ddbd7078c91c08c7b7683b3))
* **message:** support file links in markdown messages ([#103](https://github.com/sendbird-playground/stave/issues/103)) ([aae1b06](https://github.com/sendbird-playground/stave/commit/aae1b0660f4d0c73ca6a102be61665a34df47216))
* **metrics:** add memory usage popover to sidebar ([#87](https://github.com/sendbird-playground/stave/issues/87)) ([e0f3707](https://github.com/sendbird-playground/stave/commit/e0f37077675f8d5d09d00d3ba2110da35d80bbb3))
* notification system ([#93](https://github.com/sendbird-playground/stave/issues/93)) ([759f0b7](https://github.com/sendbird-playground/stave/commit/759f0b70c02f35fb375bdef9af3fed241741700b))
* **notifications:** add history view and idle completion alerts ([#109](https://github.com/sendbird-playground/stave/issues/109)) ([10879ba](https://github.com/sendbird-playground/stave/commit/10879ba53c0a6fc7e0c5f74d1ab65b73d4f7890a))
* **notifications:** add mark read and history view support ([#102](https://github.com/sendbird-playground/stave/issues/102)) ([b3bccef](https://github.com/sendbird-playground/stave/commit/b3bccef74c594cbd382615cdbdc2626b71b4be09))
* **sidebar:** change workspace close to archive ([#78](https://github.com/sendbird-playground/stave/issues/78)) ([5144b3e](https://github.com/sendbird-playground/stave/commit/5144b3e4d7ef1e9ae7252071fd933c6be65ca4a4))
* **sidebar:** swap task count with archive button on workspace hover ([#91](https://github.com/sendbird-playground/stave/issues/91)) ([6077a0a](https://github.com/sendbird-playground/stave/commit/6077a0af1bd7d741f51a775844e2fcb994dc80a2))
* **topbar:** replace open PR with create PR dialog ([#75](https://github.com/sendbird-playground/stave/issues/75)) ([8fbe911](https://github.com/sendbird-playground/stave/commit/8fbe9116fad35c444d959e533b39bdfa963569d0))
* **workspace:** add PR status tracking to sidebar and topbar ([#85](https://github.com/sendbird-playground/stave/issues/85)) ([d462a82](https://github.com/sendbird-playground/stave/commit/d462a82121837e4a5b880da51a52f0326d176847))

### Bug Fixes

* **branch-dropdown:** prevent branch detection race conditions ([#89](https://github.com/sendbird-playground/stave/issues/89)) ([05b9845](https://github.com/sendbird-playground/stave/commit/05b9845afbdd96547e03f07723ac3c93dabcba4b))
* **chat:** deduplicate code_diff parts for the same file path ([#86](https://github.com/sendbird-playground/stave/issues/86)) ([f5c9c34](https://github.com/sendbird-playground/stave/commit/f5c9c34abc3e2be5c0d9eca0be26edfbf43c7149))
* disable create PR button when tasks are responding ([#104](https://github.com/sendbird-playground/stave/issues/104)) ([7c86db9](https://github.com/sendbird-playground/stave/commit/7c86db911bebcc0e516090be3a39d7caca82cfa4))
* **explorer:** show build folder in file tree ([734adb0](https://github.com/sendbird-playground/stave/commit/734adb0c3006c49d018d93264a8010b6d3fbf59f))
* **logo:** enlarge icons and refine bar scaling ([#69](https://github.com/sendbird-playground/stave/issues/69)) ([8728b81](https://github.com/sendbird-playground/stave/commit/8728b81509b8f33cb22fdfd7c916f175a6b9207a))
* **logo:** remove dark background from stave-logo.svg ([#70](https://github.com/sendbird-playground/stave/issues/70)) ([3550fda](https://github.com/sendbird-playground/stave/commit/3550fdae416e7e35ce7c0da8887818f73e7eb9f3))
* **message:** preserve file reference locations in markdown links ([#107](https://github.com/sendbird-playground/stave/issues/107)) ([0db840c](https://github.com/sendbird-playground/stave/commit/0db840c64b277a03c4ba6e2edbb6d4b3dea7a831))
* **message:** use explorer file icons in markdown links ([#105](https://github.com/sendbird-playground/stave/issues/105)) ([2293ab4](https://github.com/sendbird-playground/stave/commit/2293ab46730c8c985dd651fef553a7ca508a4882))
* **projects:** move repository controls into settings ([#84](https://github.com/sendbird-playground/stave/issues/84)) ([1830c94](https://github.com/sendbird-playground/stave/commit/1830c947c5a073231cb732f3bd89a17af910fa18))
* **shell:** align right panels with top bar ([#98](https://github.com/sendbird-playground/stave/issues/98)) ([154082e](https://github.com/sendbird-playground/stave/commit/154082e9822c935a396a8b6c5c0cf1f6bdbce47a))
* **shell:** raise right rail beside task tabs ([#96](https://github.com/sendbird-playground/stave/issues/96)) ([7ee3380](https://github.com/sendbird-playground/stave/commit/7ee3380a11bad1ab1035b5dd7ab73504b8352ee4))
* **sidebar:** account for macOS traffic lights in collapsed width ([#90](https://github.com/sendbird-playground/stave/issues/90)) ([e0bdb68](https://github.com/sendbird-playground/stave/commit/e0bdb680a849108331f78d416416f96db58a3817))
* **sidebar:** account for macOS traffic lights in collapsed width ([#90](https://github.com/sendbird-playground/stave/issues/90)) ([#95](https://github.com/sendbird-playground/stave/issues/95)) ([45294c4](https://github.com/sendbird-playground/stave/commit/45294c4015fe45eb38ce29a1dc97d21424b6d310))
* **sidebar:** move expand button to topbar and add traffic-light clearance ([#83](https://github.com/sendbird-playground/stave/issues/83)) ([34378c8](https://github.com/sendbird-playground/stave/commit/34378c8d500c53d3a83905f0d168db34133b37f9))
* **topbar:** align file search to the right end ([#74](https://github.com/sendbird-playground/stave/issues/74)) ([07a49ff](https://github.com/sendbird-playground/stave/commit/07a49ff680f1e0bfd1106921709c743db2de808d))
* **topbar:** remove unnecessary left padding on branch selector ([#76](https://github.com/sendbird-playground/stave/issues/76)) ([0fad597](https://github.com/sendbird-playground/stave/commit/0fad597d07cd6960d63076e2cf9757e4a660d3f6))
* **topbar:** stabilize create pr flow ([#81](https://github.com/sendbird-playground/stave/issues/81)) ([30d5395](https://github.com/sendbird-playground/stave/commit/30d5395885c8032b869c54414f43f40115e8b109))
* **topbar:** use native macOS traffic-light buttons and move utility actions to sidebar ([#73](https://github.com/sendbird-playground/stave/issues/73)) ([1199b28](https://github.com/sendbird-playground/stave/commit/1199b2897ab32bfc2e8596a275d5850932a77162))
* **topbar:** use native macOS traffic-light buttons instead of custom controls ([#71](https://github.com/sendbird-playground/stave/issues/71)) ([87fcebd](https://github.com/sendbird-playground/stave/commit/87fcebd74f999e28a01377d2a6c8b4fe4b3d9d7d))
* **ui:** add app-wide tooltip provider ([ba454f9](https://github.com/sendbird-playground/stave/commit/ba454f917a532eb5869440d2ab33da7a8fdbf793))
* **ui:** widen chat area max-width from 5xl to 6xl ([#77](https://github.com/sendbird-playground/stave/issues/77)) ([4ff8e97](https://github.com/sendbird-playground/stave/commit/4ff8e97bf319c64251f80e3de8d99f08badb0ba7))
* **workspacebar:** adjust tooltip positioning from right to top ([#88](https://github.com/sendbird-playground/stave/issues/88)) ([2817c5a](https://github.com/sendbird-playground/stave/commit/2817c5a6651c1b33f19795ac73be50a343a96169))
* **workspace:** persist project registry and recover legacy workspaces ([#94](https://github.com/sendbird-playground/stave/issues/94)) ([9a99d2c](https://github.com/sendbird-playground/stave/commit/9a99d2ccae83dd5e23d8def2d590387765f83b47))
## [0.0.27](https://github.com/sendbird-playground/stave/compare/v0.0.26...v0.0.27) (2026-03-30)

### Features

* **branding:** refresh the A-1 Focused Lens logo across app and landing assets ([#64](https://github.com/sendbird-playground/stave/issues/64)) ([4902e6d](https://github.com/sendbird-playground/stave/commit/4902e6d12388ae7f3a2bc35b1d0449f1275113f2))

### Bug Fixes

* **compact:** remove compacting spinner once compact completes ([#66](https://github.com/sendbird-playground/stave/issues/66)) ([5f413d2](https://github.com/sendbird-playground/stave/commit/5f413d21de6f6277787e21a86ad5835f1d871a9f))
* improve inline auto-complete behavior ([#65](https://github.com/sendbird-playground/stave/issues/65)) ([c3e4e74](https://github.com/sendbird-playground/stave/commit/c3e4e743193330c0551b8db2e500ee3bce2303cd))
* **skills:** handle skill-only invocations ([#68](https://github.com/sendbird-playground/stave/issues/68)) ([fe2694f](https://github.com/sendbird-playground/stave/commit/fe2694fc3d81c8d553edd3c103b348f2f74bda92))
## [0.0.26](https://github.com/sendbird-playground/stave/compare/v0.0.25...v0.0.26) (2026-03-29)

### Features

* **commands:** format stave command outputs as Markdown for rich rendering ([#43](https://github.com/sendbird-playground/stave/issues/43)) ([ab23785](https://github.com/sendbird-playground/stave/commit/ab2378594b054e5936196bdfafb00f1733277b12))
* **exploration:** add repo-map AI context injection and TypeScript LSP support ([#59](https://github.com/sendbird-playground/stave/issues/59)) ([4c4ac2b](https://github.com/sendbird-playground/stave/commit/4c4ac2bfe8aa75063cf5272fd8afd7fb7084d011))
* **exploration:** add repo-map cache and docs ([#57](https://github.com/sendbird-playground/stave/issues/57)) ([f4f070c](https://github.com/sendbird-playground/stave/commit/f4f070c0e0dcdd1d2f720344c49a61156fd0c068))
* **explorer:** add file and folder creation with extension icons ([#54](https://github.com/sendbird-playground/stave/issues/54)) ([745ff54](https://github.com/sendbird-playground/stave/commit/745ff54ae4f2f75e33d4e877aae9d27298756c40))
* **providers:** add 1M context window model variants ([#63](https://github.com/sendbird-playground/stave/issues/63)) ([7f06b6d](https://github.com/sendbird-playground/stave/commit/7f06b6d))
* **providers:** reflect claude and codex sdk upgrades ([#51](https://github.com/sendbird-playground/stave/issues/51)) ([2663580](https://github.com/sendbird-playground/stave/commit/26635806c4fae1f04d11685785e3a98fb9c351ad))
* **ui:** add checkpoint UI for compact_boundary with git-based restore ([#53](https://github.com/sendbird-playground/stave/issues/53)) ([fa5e436](https://github.com/sendbird-playground/stave/commit/fa5e436b7b081239c67f9c57e481cb6f43536a3c))

### Bug Fixes

* **chat:** hide modifying notice when inline diff is shown ([#56](https://github.com/sendbird-playground/stave/issues/56)) ([920068a](https://github.com/sendbird-playground/stave/commit/920068a2886ce8f708fde1612c0ac00c0523a24e))
* **chat:** prevent code block flickering during streaming ([#44](https://github.com/sendbird-playground/stave/issues/44)) ([5da9fb1](https://github.com/sendbird-playground/stave/commit/5da9fb1f04c3e84c4769a48606a516be5bb8f9c2))
* **ipc:** strip renderer-only tool metadata from provider history ([#52](https://github.com/sendbird-playground/stave/issues/52)) ([baa4f3c](https://github.com/sendbird-playground/stave/commit/baa4f3cf94d7f278073047ca71f2078503642894))
* **markdown:** add custom hr component to fix divider spacing ([#46](https://github.com/sendbird-playground/stave/issues/46)) ([5231365](https://github.com/sendbird-playground/stave/commit/5231365794af6ff2c5bea55d0b43696e4715b98a))
* **skills:** embed skill instructions in prompt and stop blocking valid commands ([#49](https://github.com/sendbird-playground/stave/issues/49)) ([f3f4d07](https://github.com/sendbird-playground/stave/commit/f3f4d0721ee58c5307cc6b5984f212c5a0f49965))
* **stave-auto:** harden subtask breakdown parsing ([#50](https://github.com/sendbird-playground/stave/issues/50)) ([2981f27](https://github.com/sendbird-playground/stave/commit/2981f27de3b59a36c8178a7600b4ab2b48302b41))
* **stave-release:** clean up temporary release worktree ([#45](https://github.com/sendbird-playground/stave/issues/45)) ([df5090c](https://github.com/sendbird-playground/stave/commit/df5090c66ca077e2b1f8233f15456b7b61c3937d))
* **ui:** prevent cmdk auto-selecting first item in selector palettes ([#48](https://github.com/sendbird-playground/stave/issues/48)) ([002d3df](https://github.com/sendbird-playground/stave/commit/002d3df76873af2769888805f99f35e65cd0f867))
* **ui:** preserve leading-7 line-height from twMerge in message blocks ([#62](https://github.com/sendbird-playground/stave/issues/62)) ([a0728a3](https://github.com/sendbird-playground/stave/commit/a0728a3))
* **ui:** widen sidebar resize handle and smooth collapse transition ([#58](https://github.com/sendbird-playground/stave/issues/58)) ([8fe409a](https://github.com/sendbird-playground/stave/commit/8fe409aa53fda8007f3106400407f23b56e2d701))
* **workspace:** align shell naming and remove legacy ui ([#55](https://github.com/sendbird-playground/stave/issues/55)) ([23de43c](https://github.com/sendbird-playground/stave/commit/23de43c99e876ab83cb285f070cdf208f463aeac))
## [0.0.25](https://github.com/sendbird-playground/stave/compare/v0.0.24...v0.0.25) (2026-03-27)

### Features

* add GitHub Pages landing page for Stave ([#38](https://github.com/sendbird-playground/stave/issues/38)) ([5887ce8](https://github.com/sendbird-playground/stave/commit/5887ce8140bf75bc1b33abf58330fc55e0bb3037))

### Bug Fixes

* **ipc:** sanitize oversized plan approval payloads ([#39](https://github.com/sendbird-playground/stave/issues/39)) ([8b03dd7](https://github.com/sendbird-playground/stave/commit/8b03dd72045f73a9f1e692018e52aec8c633147c))
* **stave-auto:** suppress routing JSON when payload uses intent field ([#41](https://github.com/sendbird-playground/stave/issues/41)) ([edec318](https://github.com/sendbird-playground/stave/commit/edec318513a86d6c28745a6fca5cbdd0c9771977))
* **workspace:** reuse root node_modules in worktrees ([#37](https://github.com/sendbird-playground/stave/issues/37)) ([d1aa2d8](https://github.com/sendbird-playground/stave/commit/d1aa2d88f721bcdf6064236af4471ec640611685))
## [0.0.24](https://github.com/sendbird-playground/stave/compare/v0.0.23...v0.0.24) (2026-03-27)

### Features

* **commands:** add /stave:sync to fetch and pull current branch ([#30](https://github.com/sendbird-playground/stave/issues/30)) ([599d0a5](https://github.com/sendbird-playground/stave/commit/599d0a5099075ff3dc53ba91971e84f44dd50db3))
* **subagent:** show task_progress inside SubagentCard via Hook-based agent tracking ([#35](https://github.com/sendbird-playground/stave/issues/35)) ([828e8ce](https://github.com/sendbird-playground/stave/commit/828e8ceacdf2f123b00c68410a99b184172cd6d6))

### Bug Fixes

* add searchable branch picker and restore long timeouts ([#27](https://github.com/sendbird-playground/stave/issues/27)) ([2099cd9](https://github.com/sendbird-playground/stave/commit/2099cd9ff2d160f502f0569134e6107b42c92d7e))
* **chat:** scroll to bottom when switching tasks ([#28](https://github.com/sendbird-playground/stave/issues/28)) ([13f159e](https://github.com/sendbird-playground/stave/commit/13f159e4cf4cc2ae8604631db14de9fcd1290766))
* improve file search layout and responsiveness ([#32](https://github.com/sendbird-playground/stave/issues/32)) ([188964e](https://github.com/sendbird-playground/stave/commit/188964e314d568b69bf70fd18fcac25b4a16e8f9))
* **scm:** filter stale branches from workspace creation dialog ([#26](https://github.com/sendbird-playground/stave/issues/26)) ([fc36fb9](https://github.com/sendbird-playground/stave/commit/fc36fb95e3d5163b586759fef50947e661608934))
* **stave:** skill fast-path bypasses preprocessor and unifies skill visibility ([#34](https://github.com/sendbird-playground/stave/issues/34)) ([708417d](https://github.com/sendbird-playground/stave/commit/708417d6792ea9eb45d8309621d670dc3fe22e9d))
* **topbar:** consolidate open-in actions into overflow dropdown ([#29](https://github.com/sendbird-playground/stave/issues/29)) ([fd0c2a2](https://github.com/sendbird-playground/stave/commit/fd0c2a2926c0beb0049c0e5d23010ba2d8e1d1c4))
* **topbar:** hide project-only UI when no project/workspace is selected ([#25](https://github.com/sendbird-playground/stave/issues/25)) ([bf3ad22](https://github.com/sendbird-playground/stave/commit/bf3ad22e42b96f915d6233f9c983b733216a7035))
# Changelog

## [0.0.23](https://github.com/sendbird-playground/stave/compare/v0.0.22...v0.0.23) (2026-03-26)

### Bug Fixes

* **release:** preserve macOS framework symlinks ([#23](https://github.com/sendbird-playground/stave/issues/23)) ([723c199](https://github.com/sendbird-playground/stave/commit/723c199))

## [0.0.22](https://github.com/sendbird-playground/stave/compare/v0.0.21...v0.0.22) (2026-03-26)

### Bug Fixes

* add gh-authenticated macOS installer flow ([#21](https://github.com/sendbird-playground/stave/issues/21)) ([ed68911](https://github.com/sendbird-playground/stave/commit/ed68911))

## [0.0.21](https://github.com/sendbird-playground/stave/compare/v0.0.20...v0.0.21) (2026-03-26)

### Bug Fixes

* **desktop:** ship internal macOS app bundle zip ([#19](https://github.com/sendbird-playground/stave/issues/19)) ([20ae651](https://github.com/sendbird-playground/stave/commit/20ae651))
* wrap topbar workspace path tooltip ([#18](https://github.com/sendbird-playground/stave/issues/18)) ([44055d8](https://github.com/sendbird-playground/stave/commit/44055d8))
* **paths:** remove user-specific absolute paths ([#17](https://github.com/sendbird-playground/stave/issues/17)) ([9314def](https://github.com/sendbird-playground/stave/commit/9314def))

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

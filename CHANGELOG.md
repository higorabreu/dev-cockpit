# Changelog

Newest first. Generated from Conventional Commits by release-please. The 0.1.0 entry at the end was
written by hand for a private build, before the first public release.

## Unreleased

Written by hand on the Windows port branch until the next release replaces it.

### Miscellaneous Chores

* keep LF line endings in a Windows checkout

### Documentation

* plan the Windows port ([plans/windows.md](plans/windows.md))

## [0.15.0](https://github.com/higorabreu/dev-cockpit/compare/v0.14.0...v0.15.0) (2026-11-24)


### Features

* color themes per mode, built-in and user files, with single-color overrides ([#134](https://github.com/higorabreu/dev-cockpit/issues/134)) ([af97064](https://github.com/higorabreu/dev-cockpit/commit/af970642a01988e69dcd90f2a78e05b23ea60756))
* make dck's palettes whole themes and merge Sálvia and Estrutura into Grafite ([#136](https://github.com/higorabreu/dev-cockpit/issues/136)) ([76a0b4a](https://github.com/higorabreu/dev-cockpit/commit/76a0b4aa9cc5f269c83a92b6c01e1e571199be65))
* move menus, search overlays and file strips as they open, and keep the window still ([#133](https://github.com/higorabreu/dev-cockpit/issues/133)) ([1f00d8a](https://github.com/higorabreu/dev-cockpit/commit/1f00d8ab464e3e26292475aac05bbb6a8531e1e1))
* split settings into pages by subject ([#137](https://github.com/higorabreu/dev-cockpit/issues/137)) ([8114a93](https://github.com/higorabreu/dev-cockpit/commit/8114a934b6e2dd352c52e8c26151f78813f7d8d1))

## [0.14.0](https://github.com/higorabreu/dev-cockpit/compare/v0.13.1...v0.14.0) (2026-11-19)


### Features

* open the settings file in a tab of its own, saved only on Ctrl+S ([#130](https://github.com/higorabreu/dev-cockpit/issues/130)) ([0a00df9](https://github.com/higorabreu/dev-cockpit/commit/0a00df9cccbf1c8b8357464b03c6546bbeec265a))

## [0.13.1](https://github.com/higorabreu/dev-cockpit/compare/v0.13.0...v0.13.1) (2026-11-19)


### Performance Improvements

* render the Linux window with the GPU again ([#127](https://github.com/higorabreu/dev-cockpit/issues/127)) ([b371185](https://github.com/higorabreu/dev-cockpit/commit/b3711856ca992ab7b7d4891bb19adae8f1750e67))

## [0.13.0](https://github.com/higorabreu/dev-cockpit/compare/v0.12.0...v0.13.0) (2026-11-19)


### Features

* open a file over its tab in an editor that saves by itself ([#116](https://github.com/higorabreu/dev-cockpit/issues/116)) ([8a86a79](https://github.com/higorabreu/dev-cockpit/commit/8a86a79c2b05b7d4c619e57ed94c06127fc1c7af))
* open files from a terminal path and from the review, at the line ([#118](https://github.com/higorabreu/dev-cockpit/issues/118)) ([2d3179b](https://github.com/higorabreu/dev-cockpit/commit/2d3179b55ebb3e7f34bbfaa64c41900de98bf5df))
* open, save, watch and merge files through a file store port ([#113](https://github.com/higorabreu/dev-cockpit/issues/113)) ([ba6d524](https://github.com/higorabreu/dev-cockpit/commit/ba6d524bbd4d93204d0771b1a9e026a5b4650850))
* search a project's files on Ctrl+Shift+O ([#115](https://github.com/higorabreu/dev-cockpit/issues/115)) ([00d6706](https://github.com/higorabreu/dev-cockpit/commit/00d6706203e431f0aa99ed97c662f9322a0f276d))
* show images, SVG, Markdown previews and PDF over the tab, and pick per conflict in Compare ([#119](https://github.com/higorabreu/dev-cockpit/issues/119)) ([504f7d2](https://github.com/higorabreu/dev-cockpit/commit/504f7d294166197d497d96023c18514c5112470f))


### Bug Fixes

* closer to VS Code search highlights, and no empty recent files in the file menu ([#123](https://github.com/higorabreu/dev-cockpit/issues/123)) ([28ec7b8](https://github.com/higorabreu/dev-cockpit/commit/28ec7b8d4ed02e3721dd067a21c389b722d7d73b))
* keep every hairline one device pixel and line up the side by side headers ([#120](https://github.com/higorabreu/dev-cockpit/issues/120)) ([155f80f](https://github.com/higorabreu/dev-cockpit/commit/155f80f3f8309d168816d257f41b000a390b8e7a))
* keep the text under the line numbers when a long line scrolls sideways ([#122](https://github.com/higorabreu/dev-cockpit/issues/122)) ([9183370](https://github.com/higorabreu/dev-cockpit/commit/918337053de1d62bef5c8e12daf02c80dd75ea31))
* let Ctrl+G and Ctrl+F swap the file's drawers from inside their fields ([#121](https://github.com/higorabreu/dev-cockpit/issues/121)) ([c99c856](https://github.com/higorabreu/dev-cockpit/commit/c99c8563a633d581780c1e4a25663a1f0b2dbae6))
* shorten the hint under the terminal paths setting ([#124](https://github.com/higorabreu/dev-cockpit/issues/124)) ([6b8efa0](https://github.com/higorabreu/dev-cockpit/commit/6b8efa086da0583b3954220c532a7eea87d41724))


### Performance Improvements

* load only the socket code when dck toggle, ping or agent signal runs ([#112](https://github.com/higorabreu/dev-cockpit/issues/112)) ([c9fc098](https://github.com/higorabreu/dev-cockpit/commit/c9fc0981cba6bf6ad8b8482026611b671e28e4e5))

## [0.12.0](https://github.com/higorabreu/dev-cockpit/compare/v0.11.0...v0.12.0) (2026-11-19)


### Features

* go full height when the edge is dragged to 100% ([#108](https://github.com/higorabreu/dev-cockpit/issues/108)) ([39d3daf](https://github.com/higorabreu/dev-cockpit/commit/39d3daf6bd430ceb46dab335e4d20eeb16725c88))


### Bug Fixes

* blink the terminal cursor with a timer instead of a per-frame animation ([#107](https://github.com/higorabreu/dev-cockpit/issues/107)) ([1bbea09](https://github.com/higorabreu/dev-cockpit/commit/1bbea09b2bb640e5e3a14624f4015bdc6914edd5))

## [0.11.0](https://github.com/higorabreu/dev-cockpit/compare/v0.10.0...v0.11.0) (2026-11-18)


### Features

* a dot on the Sessions and Work rail buttons when something waits ([#96](https://github.com/higorabreu/dev-cockpit/issues/96)) ([b01d68f](https://github.com/higorabreu/dev-cockpit/commit/b01d68fd2ae81cf0818e3a58a572895d61d5166d))
* compact update notice on a narrow window, and middle click closes a tab ([#92](https://github.com/higorabreu/dev-cockpit/issues/92)) ([fa180d7](https://github.com/higorabreu/dev-cockpit/commit/fa180d7ea95cc3e3b8add90db81f9bc5327ea423))
* install the cockpit from npm with npx @devcockpit/install ([#94](https://github.com/higorabreu/dev-cockpit/issues/94)) ([bb04707](https://github.com/higorabreu/dev-cockpit/commit/bb0470707280dc53f65112a2e7367144bd92f74d))
* Mac right click menu in the terminal, and Cmd+Q asks while a tab runs a program ([#93](https://github.com/higorabreu/dev-cockpit/issues/93)) ([3b6791e](https://github.com/higorabreu/dev-cockpit/commit/3b6791e50de4654d8a66042b7590087ed9be1208))


### Bug Fixes

* bring the cockpit forward in place on a notification click, the quit question, settings and a reopen ([#103](https://github.com/higorabreu/dev-cockpit/issues/103)) ([641f47e](https://github.com/higorabreu/dev-cockpit/commit/641f47e5cf386bea2ca354b0ba61c076552226a1))
* draw only the modifier as a keycap in click hints ([#102](https://github.com/higorabreu/dev-cockpit/issues/102)) ([beb1bb8](https://github.com/higorabreu/dev-cockpit/commit/beb1bb8f37d100fc604082ef8bd86e92ece4cd26))
* give the terminal its real background color, so reverse video and OSC 11 follow the theme ([#98](https://github.com/higorabreu/dev-cockpit/issues/98)) ([1863773](https://github.com/higorabreu/dev-cockpit/commit/1863773fe8255b41ea90b943b8d1d27de6d0ffc9))
* keep attention marks on the tabs only, not on the All tabs button ([#91](https://github.com/higorabreu/dev-cockpit/issues/91)) ([c614330](https://github.com/higorabreu/dev-cockpit/commit/c6143300339fa24da31c3ea048fdfd070e378631))
* open the hold menu with a click of a mouse trigger, and draw it above Settings ([#104](https://github.com/higorabreu/dev-cockpit/issues/104)) ([662c590](https://github.com/higorabreu/dev-cockpit/commit/662c590f14021e9b9a26223e45e1c3e9edfe686a))
* paint a readable terminal selection in the light theme ([#90](https://github.com/higorabreu/dev-cockpit/issues/90)) ([8e53de4](https://github.com/higorabreu/dev-cockpit/commit/8e53de43c5fc1363ecb73f32ffac331ee934a7e5))
* put Cancel first when a restart would end a running agent ([#101](https://github.com/higorabreu/dev-cockpit/issues/101)) ([66fa2ed](https://github.com/higorabreu/dev-cockpit/commit/66fa2ed685e23692952b2031f71b6b7594d4c2f9))
* review each submodule in its own scope, as VS Code does ([#100](https://github.com/higorabreu/dev-cockpit/issues/100)) ([19a825e](https://github.com/higorabreu/dev-cockpit/commit/19a825e5a1e86a37b5ef0904cd5215d562da8d53))


### Performance Improvements

* read untracked files for the review in process instead of one git process each ([#97](https://github.com/higorabreu/dev-cockpit/issues/97)) ([bca6912](https://github.com/higorabreu/dev-cockpit/commit/bca6912bc23a87ede4cde3cf2a7cd2b4bd772426))

## [0.10.0](https://github.com/higorabreu/dev-cockpit/compare/v0.9.0...v0.10.0) (2026-11-18)


### Features

* customizable shortcuts and hold menu trigger, and a formal pass on the interface texts ([#85](https://github.com/higorabreu/dev-cockpit/issues/85)) ([000056b](https://github.com/higorabreu/dev-cockpit/commit/000056b7ad82c96cdd34184aa4ba9e24f0b986ec))
* opt-in updates from GitHub releases, and an About page in Settings ([#88](https://github.com/higorabreu/dev-cockpit/issues/88)) ([a0a86d5](https://github.com/higorabreu/dev-cockpit/commit/a0a86d52800355d37785e0b90b8ff157feef6b4d))
* review the changes inside submodules, and open the review from the panel's Git section ([#87](https://github.com/higorabreu/dev-cockpit/issues/87)) ([5654d0e](https://github.com/higorabreu/dev-cockpit/commit/5654d0e57e5b757ea43a61d2af224f8bf368ed64))

## [0.9.0](https://github.com/higorabreu/dev-cockpit/compare/v0.8.0...v0.9.0) (2026-11-18)


### Features

* comment on review lines and send the comments to the agent ([5d2638e](https://github.com/higorabreu/dev-cockpit/commit/5d2638e842f64fbd7c08d9407f4b5266f4b87a9d))
* fonts, cursor and a settings.json like VS Code's ([#80](https://github.com/higorabreu/dev-cockpit/issues/80)) ([e7f9a44](https://github.com/higorabreu/dev-cockpit/commit/e7f9a44663ad6df6f0e7b23db527683fff31ff87))
* list GitHub pull requests to review and to follow up ([4766f16](https://github.com/higorabreu/dev-cockpit/commit/4766f162669051d52b6175220b276874d66ef2cb))
* Mac keyboard: line editing, clear, last tab, split Option and right Command ([#83](https://github.com/higorabreu/dev-cockpit/issues/83)) ([912b2a2](https://github.com/higorabreu/dev-cockpit/commit/912b2a2a798606f4be5009432013ba4564aa0a1b))
* recognize Codex and mark its tab from its own status reports ([3f539f4](https://github.com/higorabreu/dev-cockpit/commit/3f539f49400e837fb97a379dbb4b7c3699b805d0))
* rename tabs and reopen them on start ([#79](https://github.com/higorabreu/dev-cockpit/issues/79)) ([38a7fc7](https://github.com/higorabreu/dev-cockpit/commit/38a7fc7b0d50379da70aa125cd1f3c3a53c0234e))
* send the review by what runs in the tab's terminal ([9e5a2f8](https://github.com/higorabreu/dev-cockpit/commit/9e5a2f8afc5ea71da072a5d27ae250535e6b0ce2))
* set the window's height by dragging its bottom edge ([#82](https://github.com/higorabreu/dev-cockpit/issues/82)) ([538166b](https://github.com/higorabreu/dev-cockpit/commit/538166b3d9d003bd57e6e827c058e55f41285954))


### Bug Fixes

* fit the hold menu list to the window and cue the rows it hides ([ab90a92](https://github.com/higorabreu/dev-cockpit/commit/ab90a928a846cb7c882a03d0813beddf641a6ee4))
* give the review's comment field the design system scrollbar ([7ae06f3](https://github.com/higorabreu/dev-cockpit/commit/7ae06f38eef7da7c845e0f3973f9341e2c83413f))
* keep a rail badge off its icon ([d38e039](https://github.com/higorabreu/dev-cockpit/commit/d38e039d8dcb0cce193a95370f028a6bdb59a3ec))
* keep the bottom of the window on screen at full height ([#81](https://github.com/higorabreu/dev-cockpit/issues/81)) ([4d25240](https://github.com/higorabreu/dev-cockpit/commit/4d2524029a583815ac12ff81d85eab249412e9f6))
* keep the review's expanded lines open across refreshes ([bba7379](https://github.com/higorabreu/dev-cockpit/commit/bba7379c19b40c31b8204e59b6d64597c20e88f4))
* review header in a split pane and a full QA pass ([#78](https://github.com/higorabreu/dev-cockpit/issues/78)) ([e423562](https://github.com/higorabreu/dev-cockpit/commit/e423562027f0488118b8a48260b07348aa8d355c))
* send the review only to an agent running in the tab ([c388759](https://github.com/higorabreu/dev-cockpit/commit/c3887597e05c101f8c04479dca498fdbf1847f5d))
* tab bar on top at 100% height, and the dragged edge follows the pointer to the pixel ([#84](https://github.com/higorabreu/dev-cockpit/issues/84)) ([cf31d8b](https://github.com/higorabreu/dev-cockpit/commit/cf31d8b2226af23659d0676dac3ec350213bbe57))
* **ui:** fit hold menu lists below the tab bar in full screen ([c11cc8d](https://github.com/higorabreu/dev-cockpit/commit/c11cc8d6c6eeb2c53fe184ebd1796a2a0d1a18d9))
* **ui:** move and shrink the hold menu wheel in a short window ([8c2c17f](https://github.com/higorabreu/dev-cockpit/commit/8c2c17fae4121e4661afa0a0cdc5de41d16ee199))

## [0.8.0](https://github.com/higorabreu/dev-cockpit/compare/v0.7.1...v0.8.0) (2026-11-17)


### Features

* keep the review up with the agent, mark files viewed and show states as letters ([c61d670](https://github.com/higorabreu/dev-cockpit/commit/c61d6701e2fcee889b7c279b09a94cb47b3c0341))
* type the paths of files dropped on or pasted into a terminal ([cc24406](https://github.com/higorabreu/dev-cockpit/commit/cc2440600a1abad5ffc6567ba503d84aa60dbe7a))


### Bug Fixes

* let the arrow keys steer the wheel while the pointer rests on it ([0f4be72](https://github.com/higorabreu/dev-cockpit/commit/0f4be72cca1d89449454be8c25d9489c13a576ef))

## [0.7.1](https://github.com/higorabreu/dev-cockpit/compare/v0.7.0...v0.7.1) (2026-11-17)


### Bug Fixes

* build the .deb so it runs on Ubuntu 22.04 and Debian 12 ([6eb285f](https://github.com/higorabreu/dev-cockpit/commit/6eb285fb9c5421a1d2a157129e9c6ef775cf0387))
* speak English when the system language has no catalog ([a5bf114](https://github.com/higorabreu/dev-cockpit/commit/a5bf114cb493661d9972cbf63f3ec9160bd0d5a7))

## [0.7.0](https://github.com/higorabreu/dev-cockpit/compare/v0.6.1...v0.7.0) (2026-11-16)


### Features

* show shortcuts as one keycap per key, as VS Code does ([df56c1b](https://github.com/higorabreu/dev-cockpit/commit/df56c1b76cd9f6f5b1731f95c0a9a803319d7084))

## [0.6.1](https://github.com/higorabreu/dev-cockpit/compare/v0.6.0...v0.6.1) (2026-11-16)


### Bug Fixes

* open the window whole on the pointer's monitor under Wayland ([315abfa](https://github.com/higorabreu/dev-cockpit/commit/315abfa275b04d414a9e3d72dfb4ad4fd6cfa8de))

## [0.6.0](https://github.com/higorabreu/dev-cockpit/compare/v0.5.0...v0.6.0) (2026-11-16)


### Features

* use the Mac's keys, start at login through launchd and keep data in Mac folders ([8a0d697](https://github.com/higorabreu/dev-cockpit/commit/8a0d69752e29f9f42dbb48e5a7d2cc82f0de2045))


### Bug Fixes

* free a closed tab's terminal and its scrollback ([2f33007](https://github.com/higorabreu/dev-cockpit/commit/2f33007f86e374f6be44ac9769c0d32f913b66e1))
* refuse a daemon socket folder that is not private to the user ([8a0d697](https://github.com/higorabreu/dev-cockpit/commit/8a0d69752e29f9f42dbb48e5a7d2cc82f0de2045))
* stop the spell check dictionary download at startup ([#49](https://github.com/higorabreu/dev-cockpit/issues/49)) ([bfdd023](https://github.com/higorabreu/dev-cockpit/commit/bfdd023012a632c16dcdd837bf48a0259303604e))


### Performance Improvements

* render the window without the GPU on Linux ([c1774b1](https://github.com/higorabreu/dev-cockpit/commit/c1774b108e618f39a8229b442025f0efd9a7a0db))

## [0.5.0](https://github.com/higorabreu/dev-cockpit/compare/v0.4.0...v0.5.0) (2026-11-16)


### Features

* compare the branch with the one it was created from ([d597296](https://github.com/higorabreu/dev-cockpit/commit/d597296dd9046ef569d3aa115f012d5cc6cd523c))
* group tasks by progress, filter them by project and search by word start ([#31](https://github.com/higorabreu/dev-cockpit/issues/31)) ([5a01ea6](https://github.com/higorabreu/dev-cockpit/commit/5a01ea6cb0f315f5ea5a88b210d2149d3f7e2b13))
* lay out the review beside or below the terminal by the tab's shape ([d597296](https://github.com/higorabreu/dev-cockpit/commit/d597296dd9046ef569d3aa115f012d5cc6cd523c))
* name the work tabs by action and group them by service ([#30](https://github.com/higorabreu/dev-cockpit/issues/30)) ([9b6d9d6](https://github.com/higorabreu/dev-cockpit/commit/9b6d9d640cc3f78d5146bfa612e17ad8f0dd9691))
* open the window as a panel over every macOS space ([#40](https://github.com/higorabreu/dev-cockpit/issues/40)) ([4d4d725](https://github.com/higorabreu/dev-cockpit/commit/4d4d7253670cc641f2c045e1a26dfdaa04fa0f54))
* package a macOS app that finds the login shell's PATH ([#41](https://github.com/higorabreu/dev-cockpit/issues/41)) ([5ab9265](https://github.com/higorabreu/dev-cockpit/commit/5ab9265f42fb7d54e69bda4fa1ac3d5924f351db))
* read every changed file in one scroll with a file index ([d597296](https://github.com/higorabreu/dev-cockpit/commit/d597296dd9046ef569d3aa115f012d5cc6cd523c))
* review the tab's changes beside its terminal with Ctrl+Shift+D ([3c4a059](https://github.com/higorabreu/dev-cockpit/commit/3c4a05934504ac5ff17dd823641a3114965538cf))
* show each tab's folder and process on macOS ([#38](https://github.com/higorabreu/dev-cockpit/issues/38)) ([2161571](https://github.com/higorabreu/dev-cockpit/commit/21615715c024a3271a864fe425dce90011da6145))
* store secrets in the macOS Keychain ([#36](https://github.com/higorabreu/dev-cockpit/issues/36)) ([c1f1046](https://github.com/higorabreu/dev-cockpit/commit/c1f10468918ea5e261b289fced437a905bd84130))


### Bug Fixes

* ask for the projects folder instead of assuming ~/projetos ([b72d336](https://github.com/higorabreu/dev-cockpit/commit/b72d3366cb97d4aacc1b9c7c907c10bffcf56b17))
* find the review's base without naming any branch ([d597296](https://github.com/higorabreu/dev-cockpit/commit/d597296dd9046ef569d3aa115f012d5cc6cd523c))
* give the task section headings room above their first task ([9ceb143](https://github.com/higorabreu/dev-cockpit/commit/9ceb143441aa137e1e3a2039872332e7803112d4))
* keep inactive tabs hidden and the window free of a native scrollbar ([1fe3aee](https://github.com/higorabreu/dev-cockpit/commit/1fe3aeebd46a0c1500d07f73716cb2e44164d883))
* keep no divider share that a pane minimum holds back ([d597296](https://github.com/higorabreu/dev-cockpit/commit/d597296dd9046ef569d3aa115f012d5cc6cd523c))
* keep scrolling lists even between the card edges ([#33](https://github.com/higorabreu/dev-cockpit/issues/33)) ([f853a0d](https://github.com/higorabreu/dev-cockpit/commit/f853a0df8af9be11f73bb53c7d703ef0197b14a4))
* keep the diff's gutter and headers in view on a sideways scroll ([d597296](https://github.com/higorabreu/dev-cockpit/commit/d597296dd9046ef569d3aa115f012d5cc6cd523c))
* let Ctrl+Shift+D move the keys to an open review and keep its reading ([d597296](https://github.com/higorabreu/dev-cockpit/commit/d597296dd9046ef569d3aa115f012d5cc6cd523c))
* save the views cache safely and stop sending to a destroyed window ([#37](https://github.com/higorabreu/dev-cockpit/issues/37)) ([64eb7a7](https://github.com/higorabreu/dev-cockpit/commit/64eb7a71af2c8230cca8559c296a62da6704ec4e))
* show an icon's tooltip when the mouse is on its strokes ([3c4a059](https://github.com/higorabreu/dev-cockpit/commit/3c4a05934504ac5ff17dd823641a3114965538cf))
* show the branch's ticket only when Jira knows its project ([b72d336](https://github.com/higorabreu/dev-cockpit/commit/b72d3366cb97d4aacc1b9c7c907c10bffcf56b17))
* show the review's keys only while it has the focus ([d597296](https://github.com/higorabreu/dev-cockpit/commit/d597296dd9046ef569d3aa115f012d5cc6cd523c))
* word an unknown command through i18n and harden the macOS process adapter ([#39](https://github.com/higorabreu/dev-cockpit/issues/39)) ([99322a2](https://github.com/higorabreu/dev-cockpit/commit/99322a2e0d087b62c7af1c48ec00ca4b154e14d9))
* word the review with the terms of Git, GitHub and VS Code ([d597296](https://github.com/higorabreu/dev-cockpit/commit/d597296dd9046ef569d3aa115f012d5cc6cd523c))

## [0.4.0](https://github.com/higorabreu/dev-cockpit/compare/v0.3.0...v0.4.0) (2026-11-13)


### Features

* connect a Jira Cloud account and show your open tasks in a Tasks tab ([a9d14aa](https://github.com/higorabreu/dev-cockpit/commit/a9d14aa7c6a34b7a3e1caecba86a7edb10be4a29))
* enable and disable extensions with dck ext enable and dck ext disable ([efadc03](https://github.com/higorabreu/dev-cockpit/commit/efadc035ed480d7f5aa0951aeaf303773fa2f2cf))
* make GitLab a built-in connector extension that can be turned off ([efadc03](https://github.com/higorabreu/dev-cockpit/commit/efadc035ed480d7f5aa0951aeaf303773fa2f2cf))
* move through the tab menu with the arrow keys ([d5ae31e](https://github.com/higorabreu/dev-cockpit/commit/d5ae31e050a40b301495b1811857d7e6171cc100))
* open file and folder paths from the terminal with Ctrl+click ([d5ae31e](https://github.com/higorabreu/dev-cockpit/commit/d5ae31e050a40b301495b1811857d7e6171cc100))


### Bug Fixes

* keep the focus in Settings while an account is checked ([efadc03](https://github.com/higorabreu/dev-cockpit/commit/efadc035ed480d7f5aa0951aeaf303773fa2f2cf))
* keep the outline of a muted chip on a selected row in the light theme ([a9d14aa](https://github.com/higorabreu/dev-cockpit/commit/a9d14aa7c6a34b7a3e1caecba86a7edb10be4a29))
* paste once in the terminal and keep the toggle key from reopening the window ([#20](https://github.com/higorabreu/dev-cockpit/issues/20)) ([5ec57c6](https://github.com/higorabreu/dev-cockpit/commit/5ec57c653a7b0dea27eb768ae04be1b3997a4d8a))

## [0.3.0](https://github.com/higorabreu/dev-cockpit/compare/v0.2.0...v0.3.0) (2026-11-13)


### Features

* add the design system select and use it in the settings ([#18](https://github.com/higorabreu/dev-cockpit/issues/18)) ([168ee37](https://github.com/higorabreu/dev-cockpit/commit/168ee37a3c199204ebb77bbba457a16a9beae3ec))
* add the extension finder port, the files adapter and the disabled ([#10](https://github.com/higorabreu/dev-cockpit/issues/10)) ([104b227](https://github.com/higorabreu/dev-cockpit/commit/104b22720696b60dfa91fc0de2b45299633fbd8d))
* add the extension manifest, contribution points and loader to core ([#8](https://github.com/higorabreu/dev-cockpit/issues/8)) ([1af0998](https://github.com/higorabreu/dev-cockpit/commit/1af09982a66033ea912de3cca8aed1370ea96fe0))
* mark the tabs where an agent needs you or finished its turn ([#15](https://github.com/higorabreu/dev-cockpit/issues/15)) ([527a211](https://github.com/higorabreu/dev-cockpit/commit/527a2111f0f0677e7cd55d299b0de0220273c0e5))
* suggest connecting an agent from Sessions and the hold menu ([#19](https://github.com/higorabreu/dev-cockpit/issues/19)) ([eac782e](https://github.com/higorabreu/dev-cockpit/commit/eac782eb51372a425fb26e56d833bd5980040aa5))


### Bug Fixes

* keep the focus inside the open settings overlay ([#13](https://github.com/higorabreu/dev-cockpit/issues/13)) ([81a9bd9](https://github.com/higorabreu/dev-cockpit/commit/81a9bd9afac7cd6283b6d9312c7779ab2ca334d5))
* open terminal links with Ctrl+click in the default browser ([#17](https://github.com/higorabreu/dev-cockpit/issues/17)) ([9b8d849](https://github.com/higorabreu/dev-cockpit/commit/9b8d8495065c68209e8ac3b51d55c9229543b055))
* show the pointer on everything clickable ([#16](https://github.com/higorabreu/dev-cockpit/issues/16)) ([310b6fa](https://github.com/higorabreu/dev-cockpit/commit/310b6fa63ea5fc05761a6d8aecf2e157f096d2e0))
* tighten the extension foundation and keep app data in a dev-cockpit folder ([#11](https://github.com/higorabreu/dev-cockpit/issues/11)) ([8328209](https://github.com/higorabreu/dev-cockpit/commit/83282093dcc672d1bf2a59d89a2a4335f8387797))

## [0.2.0](https://github.com/higorabreu/dev-cockpit/compare/v0.1.0...v0.2.0) (2026-11-12)


### Features

* add a new tab button at the end of the tab bar ([cee3856](https://github.com/higorabreu/dev-cockpit/commit/cee38564247620a5e42e8aa09fc3f9689b4f0087))
* add a script and screenshot hook to check the shell UI without looking at the screen ([750c3da](https://github.com/higorabreu/dev-cockpit/commit/750c3da9c1b24f489a501c9c30ea6b255fcab0d4))
* add a script that builds the tokens stylesheet ([47299f7](https://github.com/higorabreu/dev-cockpit/commit/47299f7664d6572d65284edbfc4d1b4bffc201d3))
* add a setup state to the work screen, open settings on connections and show the work shortcut once connected ([beaf49c](https://github.com/higorabreu/dev-cockpit/commit/beaf49c4f89b05ce06b8fc44b422509894559d91))
* add agent limits, the pushed report data and the merge rule to core ([bda6443](https://github.com/higorabreu/dev-cockpit/commit/bda6443a865cbbcded08551c4fc09b0cc3222606))
* add an opt-in log of cursor, display and window bounds to debug monitor following ([0ae5571](https://github.com/higorabreu/dev-cockpit/commit/0ae5571b7c2b5f7ee9518debf6d9611ac512e388))
* add design tokens with CSS and terminal theme builders ([e7dc1fa](https://github.com/higorabreu/dev-cockpit/commit/e7dc1faf05516d0347e1ac2ce36c624188a973c3))
* add hold menu state machine to core ([a8623a4](https://github.com/higorabreu/dev-cockpit/commit/a8623a4104783570202226fd893012ad4e33692e))
* add opacity and font size shortcuts with persistence ([0b7e41d](https://github.com/higorabreu/dev-cockpit/commit/0b7e41dde6b205a479d8f16f9665ed1f94ad870d))
* add ports, dock controller and test fakes to core ([e5e4893](https://github.com/higorabreu/dev-cockpit/commit/e5e48930d5a2f3b37e8c62fe563203bb500af9d8))
* add project recency ordering to core ([ffbf010](https://github.com/higorabreu/dev-cockpit/commit/ffbf010b66c0a95748c4e61b717f3f5aa4831b0d))
* add tab switcher and the core public entry ([47505c1](https://github.com/higorabreu/dev-cockpit/commit/47505c114ee74f4b8682082f888f4705f1af9129))
* add the agent report to the daemon and the dck agent commands ([0a9f17b](https://github.com/higorabreu/dev-cockpit/commit/0a9f17b49af9ac1dca53ed019e38bf1f852a6a52))
* add the Agent section and show the running agent by name ([13b7e85](https://github.com/higorabreu/dev-cockpit/commit/13b7e8525b4c00a616eaf1470e7ce2290a7f4b10))
* add the attention tracker, duration formatting and the notifier port to core ([d8150f2](https://github.com/higorabreu/dev-cockpit/commit/d8150f2d29de5242e36c8571f4140211d276fbc8))
* add the Claude agent adapter that reads the end of the session transcript ([8e9727c](https://github.com/higorabreu/dev-cockpit/commit/8e9727cf3cfc56d13fc0c1cb6978226be8ad256d))
* add the collapsible side panel with project, branch and session state ([433975f](https://github.com/higorabreu/dev-cockpit/commit/433975f2786e4031de2bbd83bca8949a412e0dd2))
* add the compose status types, parser and texts to core ([038ab7e](https://github.com/higorabreu/dev-cockpit/commit/038ab7e589a1d5c06e741c6909ab9fccc4892e93))
* add the connections group to the settings screen ([28f448a](https://github.com/higorabreu/dev-cockpit/commit/28f448af1adfb223c44af2faf46c0386be09ca24))
* add the design system scrollbar and use it in every scrolling list ([f8c1105](https://github.com/higorabreu/dev-cockpit/commit/f8c11057d085183bdaf1738947bd2c215b644f21))
* add the docker cli adapter that finds the compose file and reads its containers ([c123a05](https://github.com/higorabreu/dev-cockpit/commit/c123a05a7f5dbd1bc38328d376e46925ccf0ad15))
* add the Electron shell with the daemon link, host bridge and native rebuild ([1b97df8](https://github.com/higorabreu/dev-cockpit/commit/1b97df89c32c857bc81e5486455a5a75dbf5a5a9))
* add the Environment section with the compose containers and their state ([b2857d1](https://github.com/higorabreu/dev-cockpit/commit/b2857d16d6ce6dd295e063b686ab239c136405da))
* add the exact process to the agent context and the process info ([94c79a8](https://github.com/higorabreu/dev-cockpit/commit/94c79a812b7f75f9e2c3896ec8b2dce852a82174))
* add the fuzzy search to core ([ed14eb1](https://github.com/higorabreu/dev-cockpit/commit/ed14eb1a2d5462d66bbb8c62aa149300455a2098))
* add the git cli and linux proc adapters ([dc6920e](https://github.com/higorabreu/dev-cockpit/commit/dc6920ec4c84261d9350957d733cf4bf9558b993))
* add the GitLab address setting and the connection status model ([339a279](https://github.com/higorabreu/dev-cockpit/commit/339a27971d822c6d073b5cd64fd64662fdb5eaaa))
* add the GitLab client behind the code review port ([2fc3c16](https://github.com/higorabreu/dev-cockpit/commit/2fc3c16b4ce09470fa38e67748c00c4cff760d8b))
* add the gnome custom keybinding adapter ([466a3a5](https://github.com/higorabreu/dev-cockpit/commit/466a3a52953f173699677fc40fc98e7fd4555873))
* add the hold menu view and the controller that drives the gesture ([9bd12c0](https://github.com/higorabreu/dev-cockpit/commit/9bd12c0608b00e0d2741144413ed9979bae45941))
* add the host API contract to core and move the JSON logger there ([21c81b5](https://github.com/higorabreu/dev-cockpit/commit/21c81b595024105c362ba8d408233eb732e9538f))
* add the IPC protocol, hub, client and error code registry to core ([9e07972](https://github.com/higorabreu/dev-cockpit/commit/9e079727db27232c182242a5389b6b5192f5d843))
* add the light session activity api and the panel width rule ([59be715](https://github.com/higorabreu/dev-cockpit/commit/59be71526f5a630301ab729f36665e3a147d78a0))
* add the merge request filter and the virtual list range ([26ef1bc](https://github.com/higorabreu/dev-cockpit/commit/26ef1bc396af2dbd0916f172a88e0130e498cb73))
* add the neutral agent model and classify agents by profile instead of by name ([2ff1af5](https://github.com/higorabreu/dev-cockpit/commit/2ff1af51c9e47cf693fe3013c5107b23a853baab))
* add the node-net transport, the daemon and the dck CLI ([17f8c4f](https://github.com/higorabreu/dev-cockpit/commit/17f8c4f93c1c3cd484b96d828d35d7800dc5e38d))
* add the node-pty adapter for the PTY port ([52b20a6](https://github.com/higorabreu/dev-cockpit/commit/52b20a666721945a32981edd3fb9b7e85d4ab546))
* add the one command local install and the separate dev mode ([9762730](https://github.com/higorabreu/dev-cockpit/commit/97627304e592178a11670339adf0180157d4a3d0))
* add the preferences rules for opacity and font size to core ([3e9fa66](https://github.com/higorabreu/dev-cockpit/commit/3e9fa66eb9f152a915b678791cbcd11b3e7033ce))
* add the project search overlay with a shortcut and a menu entry ([e937d12](https://github.com/higorabreu/dev-cockpit/commit/e937d12e9020980e90d1cbdaccd1c9daa66092ea))
* add the Review and Mine merge request views ([c54580b](https://github.com/higorabreu/dev-cockpit/commit/c54580bc5e207148ea885dc614d9ff415f8c41eb))
* add the secret tool vault adapter ([29c0b5d](https://github.com/higorabreu/dev-cockpit/commit/29c0b5d71ea24cafcdf7d8189dad0313923c090e))
* add the session ports, git status parsing and activity classification to core ([85503ef](https://github.com/higorabreu/dev-cockpit/commit/85503ef27bf3cc3bef10cd4e69510813a624c897))
* add the settings gear to the rail and a close button to the settings ([1393ec1](https://github.com/higorabreu/dev-cockpit/commit/1393ec13e6357be24e69e72694a8a66bffc0f423))
* add the settings model, the key to accelerator conversion and the settings plan ([57bca28](https://github.com/higorabreu/dev-cockpit/commit/57bca28a158c5cf75e41f087eb300c5478c142a8))
* add the settings overlay with language, appearance, window, shortcuts, projects and system options ([ed5903a](https://github.com/higorabreu/dev-cockpit/commit/ed5903a619570ac85a67d3438d1e7617aea45b65))
* add the settings store, the settings channels and use them for the shortcut, height and projects folder ([738fd6f](https://github.com/higorabreu/dev-cockpit/commit/738fd6f971a5cfca13b2a5cf1a5acf79c5c0a22f))
* add the side panel v2 with a rail, collapsible sections and sessions ([a133c0d](https://github.com/higorabreu/dev-cockpit/commit/a133c0dfdcd3a8ba6f4b599e5fde2b1ea319cdef))
* add the Source Control style git section and the design system tooltip ([440b997](https://github.com/higorabreu/dev-cockpit/commit/440b99776b269683fa6268b981ad0b6edda5b1dd))
* add the status icon and autostart ports to core ([00debac](https://github.com/higorabreu/dev-cockpit/commit/00debacc720aa9f8dfda265211ae7548341fca99))
* add the system notification channel and the Electron notifier ([1ca171b](https://github.com/higorabreu/dev-cockpit/commit/1ca171bb329af36f9d4f330fe3dc65f3856be573))
* add the tab bar, context menu, shortcuts and layout transition ([7da4e73](https://github.com/higorabreu/dev-cockpit/commit/7da4e73430f13e986eacf4ed7b7557532096803d))
* add the tabs domain to core and the full height event to the host API ([1dabb14](https://github.com/higorabreu/dev-cockpit/commit/1dabb1444ae9ab5a2298b2fd31d4006bbde14d4e))
* add the tooltip placement rule and drop the submodule pointer from the git model ([3af5fc3](https://github.com/higorabreu/dev-cockpit/commit/3af5fc3ffabbfe180f0e924bc87ca07a3dfcca0d))
* add the translator with pt-BR and en catalogs and make relative time language neutral ([e5dc0ac](https://github.com/higorabreu/dev-cockpit/commit/e5dc0ac67be5d489f1a8aecf967bd1b1b20f2147))
* add the tray icon with a menu and the opt-in autostart on login ([1826511](https://github.com/higorabreu/dev-cockpit/commit/1826511bc93de90f0e770402b51fc6881421556c))
* add the UI with the terminal, tokens, theme and clipboard behavior ([840af2a](https://github.com/higorabreu/dev-cockpit/commit/840af2a93e93f24d47bdf77b25e9f81a2db15934))
* add the views icon to the rail and a shortcut to them after connecting ([b5d636c](https://github.com/higorabreu/dev-cockpit/commit/b5d636c482a6ef8777b4edd2c29786336777878c))
* add the views service with a per account cache ([d18d76f](https://github.com/higorabreu/dev-cockpit/commit/d18d76f954605b5c5e4c2d48438f84aef26bc8a9))
* add WCAG AA contrast checks over the design tokens ([9f48233](https://github.com/higorabreu/dev-cockpit/commit/9f48233304376c9739fe8b851d079274cf5d2107))
* add WCAG color math to the design package ([de80a79](https://github.com/higorabreu/dev-cockpit/commit/de80a7967436adedb3c219574d628af2f5ccd2a4))
* apply the language and the projects folder live from the settings ([2110d4b](https://github.com/higorabreu/dev-cockpit/commit/2110d4bd80c4e88b4bf6c8747ca9cd3d9065247a))
* bind the window shortcut through gnome when packaged ([a2e848b](https://github.com/higorabreu/dev-cockpit/commit/a2e848b1e566e09ebb03d4fe431cea865d7bdaeb))
* build a deb package with the app, the dck command and the menu entry ([1f8ec08](https://github.com/higorabreu/dev-cockpit/commit/1f8ec08f6576b3e0d45ef7afca54f03376824d91))
* compose the app with tabs and style the bar, notice and menu ([5bf6658](https://github.com/higorabreu/dev-cockpit/commit/5bf66580473438a95c7c8cb656efcffad19f4291))
* connect the GitLab account from the host with the token in the keyring ([b5aed20](https://github.com/higorabreu/dev-cockpit/commit/b5aed20a2e8559c3c0cf811f4d7cdfba6b04e718))
* drive the theme, opacity, font, language, hold trigger and threshold from the settings and migrate the old preferences ([0325cf8](https://github.com/higorabreu/dev-cockpit/commit/0325cf88b808941150fbde6effde7a673ba05b4b))
* expose a session snapshot with process and git state to the interface ([a02dbec](https://github.com/higorabreu/dev-cockpit/commit/a02dbecbede8debb5293fd1a2471c156d1dfb281))
* expose the compose environment of a session to the interface ([2dac0c7](https://github.com/higorabreu/dev-cockpit/commit/2dac0c74781acdbdbe39e3b4de310ec4848d96e9))
* expose the views to the interface through the shell ([0b738b6](https://github.com/higorabreu/dev-cockpit/commit/0b738b6d40bd2b2ccf960061302ea48ae449ef3d))
* inspect staged files, unpushed commits and submodules with the git cli ([d5e6c33](https://github.com/higorabreu/dev-cockpit/commit/d5e6c337365caff95c1680da68bd81184386a543))
* keep the agent reports, pass the terminal id and the exact process to the agent inspector ([f506fb1](https://github.com/higorabreu/dev-cockpit/commit/f506fb1d247056e52ca0e9be94218450c431c0d7))
* keep the tab name with an index when duplicating a tab ([b4ed0f2](https://github.com/higorabreu/dev-cockpit/commit/b4ed0f26df2fe8b70bf94c3bfa232f6096a24118))
* let a tooltip prefer the left side of its element ([2333ee1](https://github.com/higorabreu/dev-cockpit/commit/2333ee1c9b7e50d305ce7c076b3280176d9b7c03))
* let the shell start the daemon in the background when it is not running ([b2c4c03](https://github.com/higorabreu/dev-cockpit/commit/b2c4c03d92cb38a9a19c9556a810666667dac73e))
* list projects by scanning the projects root and expose them to the interface ([781ca4d](https://github.com/higorabreu/dev-cockpit/commit/781ca4d86670eb6254d14e83faf3fe1dad3b3e87))
* log notification requests and make the test hook timeout configurable ([74c1ea7](https://github.com/higorabreu/dev-cockpit/commit/74c1ea763101242cd7c0e74a5454d4af085822ae))
* log rejected agent reports and make the install output readable ([09ebe04](https://github.com/higorabreu/dev-cockpit/commit/09ebe0492eb2f0741812a23b5456e5d6f35f9840))
* make the terminal session per tab and report copied text ([8e642f6](https://github.com/higorabreu/dev-cockpit/commit/8e642f68a9c22beca18421e31bca3d81db4bbb6d))
* move the remaining interface, tray and cli texts to the translator ([64d4d6f](https://github.com/higorabreu/dev-cockpit/commit/64d4d6fe66ffd0283e36e8a839f67114512caca6))
* move the reset all button to the end of the system tab ([f013cb1](https://github.com/higorabreu/dev-cockpit/commit/f013cb130464248c29039ec766587c02ac2cebd5))
* open merge requests in the system browser from the connected origin only ([c6e7140](https://github.com/higorabreu/dev-cockpit/commit/c6e7140068bc5783ccbde3c3eee788c3d8489a4e))
* organize the settings screen in tabs with a section list on the left ([a5ba44f](https://github.com/higorabreu/dev-cockpit/commit/a5ba44fed82b44d6494dc4f184c6098017a16a63))
* pin favorite projects with Ctrl+D in the search and list them first ([8dd36ac](https://github.com/higorabreu/dev-cockpit/commit/8dd36acca4b11277842cf72ab618f09a619b5ed5))
* rank projects by recent use and repository activity in core ([886388d](https://github.com/higorabreu/dev-cockpit/commit/886388d14ed40cffc74e29763ce77ce4b57b1d20))
* read the full git status, commits, submodules and ticket in core ([f4fa636](https://github.com/higorabreu/dev-cockpit/commit/f4fa6369a88cf92d1fc91c7e59cbe45120a4a035))
* read the transcript the agent reports and show long durations in days ([fa3ecc6](https://github.com/higorabreu/dev-cockpit/commit/fa3ecc6ff6bc54c5877f831dc0d5f7e0aecd11b6))
* recognize agents by profile and expose the agent session of a terminal ([51e16a7](https://github.com/higorabreu/dev-cockpit/commit/51e16a7692fd6febd7c091ea371ab5bca57b482a))
* rename the views screen to Work, switch tabs with arrows and drop the rail counter ([e59c141](https://github.com/higorabreu/dev-cockpit/commit/e59c141e9c3a35e9c1c712a96f97a74e5de2964d))
* rename the work tabs to Assigned and Created ([5b89207](https://github.com/higorabreu/dev-cockpit/commit/5b89207805f713b05753b33bb6b4e5e3b87d1487))
* replace the app and tray icons with the new definitive design ([87cbbb1](https://github.com/higorabreu/dev-cockpit/commit/87cbbb1a3b5b4fcddef3b02674154d3b7a0d8528))
* rework the hold menu to open at the center and add the hold gesture ([6964984](https://github.com/higorabreu/dev-cockpit/commit/6964984efb85c323028d3196bd82612286c9afe7))
* scan submodules and keep the project recency in a file on the host ([06d2803](https://github.com/higorabreu/dev-cockpit/commit/06d280374a450aec15222f55bfabc333e136a50b))
* scroll the tab bar, list all tabs and keep the copied notice off the tabs ([6dc96d3](https://github.com/higorabreu/dev-cockpit/commit/6dc96d398a1876994ba78eb6702c23779e39ee40))
* serve the GitLab views from the daemon with a file cache ([7fec297](https://github.com/higorabreu/dev-cockpit/commit/7fec29713a3f59d9f52b530316d4d1e2d585ea04))
* shorten the work setup text ([2489e19](https://github.com/higorabreu/dev-cockpit/commit/2489e197c2ff933808d1bb9fd93265892b6ed53a))
* show finished commands in the panel, tab bar and rail and add the next finished shortcut ([8d790ee](https://github.com/higorabreu/dev-cockpit/commit/8d790ee4716c44b8e8f18923c8a58de0de9a2a06))
* show the app identity icon at the center of the hold menu when nothing is selected ([50043c1](https://github.com/higorabreu/dev-cockpit/commit/50043c1a21172daf13f1f0f2b2d70112e9871f1c))
* show the context window, cost and rate limits in the Agent section ([4d387fb](https://github.com/higorabreu/dev-cockpit/commit/4d387fbcef56cf1a8c1cba7e1733106b87a794ca))
* show the full project path next to the name in the project search ([58cb3e6](https://github.com/higorabreu/dev-cockpit/commit/58cb3e6d9dd9a2a952db2177b8dc1261ee51f616))
* show the scrollbar only while scrolling or hovering the list ([b6c7d60](https://github.com/higorabreu/dev-cockpit/commit/b6c7d60f643a917f571c8217e9ddb78deb33db2c))
* standardize floating panels with a shared close button and key hints ([0974337](https://github.com/higorabreu/dev-cockpit/commit/09743377434b9083edce9f8a00fd58e4f5c0f940))
* toggle the side panel from the rail and drop its title and header background ([b8ab912](https://github.com/higorabreu/dev-cockpit/commit/b8ab912ac7c0d3aba664e4379e544f90e476c3c9))
* translate the Claude statusLine to the neutral model and plan its install in the settings ([c05bfef](https://github.com/higorabreu/dev-cockpit/commit/c05bfefc27d9e4a5d941bc14f592fe1ebf60b43f))
* translate the panel and use the VS Code Portuguese git terms with pull and push ([352317f](https://github.com/higorabreu/dev-cockpit/commit/352317fae1941d05c82cf0697d363dd8defa4b57))
* version the daemon and replace an outdated one that survived an update ([d3a353b](https://github.com/higorabreu/dev-cockpit/commit/d3a353b00d933813e110cd3d2395134f583476c3))
* wire the hold menu, the project list and the tab switcher into the app ([242268d](https://github.com/higorabreu/dev-cockpit/commit/242268d5ce60ceedbe0b62fce8488ac64105f6ec))


### Bug Fixes

* call the staged group Alterações preparadas in the Portuguese catalog ([5440bcd](https://github.com/higorabreu/dev-cockpit/commit/5440bcd045ebe24fd41d3b3f3ba94ecdbadc2d64))
* call the staged group Stage in the Portuguese catalog ([f956c2b](https://github.com/higorabreu/dev-cockpit/commit/f956c2b384820f843c8b6b3058a4705a5ee74331))
* center the merge request state chips with svg icons ([48e5c45](https://github.com/higorabreu/dev-cockpit/commit/48e5c4522e0643801a81dd88ec70d67d31e497fa))
* center the work setup state vertically ([e84af6f](https://github.com/higorabreu/dev-cockpit/commit/e84af6ff55435f8fea9c2da4e5fc50ac80df063a))
* download the Electron binary when packaging a fresh checkout ([b039076](https://github.com/higorabreu/dev-cockpit/commit/b039076e96c11d960c7cbcfb532e962fe93238a1))
* enlarge the hold menu identity icon ([c55d726](https://github.com/higorabreu/dev-cockpit/commit/c55d7268fe7749a9050cda23ca4a983515c85990))
* find the agent session by the process registry instead of the newest transcript ([c48396b](https://github.com/higorabreu/dev-cockpit/commit/c48396b911f3b0dfea7780e6b685620a086bec2f))
* fit the terminal on the next frame and hide the scrollbar while the layout shifts ([c259604](https://github.com/higorabreu/dev-cockpit/commit/c25960468cf7dcba3ecb75aa389f6e39be891b3c))
* follow the design system selected style in the new tabs and lists ([4af50b0](https://github.com/higorabreu/dev-cockpit/commit/4af50b02331c6f1a40453b52c616f469c688c937))
* format the estimated cost with the locale of the interface ([6c270cf](https://github.com/higorabreu/dev-cockpit/commit/6c270cf70461d374bed30d6c2fb58517ef9da7d7))
* handle F11 on the whole window and keep the focus when the panel redraws ([0783c05](https://github.com/higorabreu/dev-cockpit/commit/0783c05f63a45f0f3f32efcb80f98b76ee456873))
* hide the native viewport scrollbar of the terminal ([340407a](https://github.com/higorabreu/dev-cockpit/commit/340407a3ca8b639e431876eae771ca460003d54e))
* keep daemon event errors, stale daemon kills and uncaught exceptions out of the main process dialog ([78bf2e8](https://github.com/higorabreu/dev-cockpit/commit/78bf2e8f9e0f81bcca923a5dec89ef3b415cdaa6))
* keep one keyring token per profile so dev never removes the real one ([250e171](https://github.com/higorabreu/dev-cockpit/commit/250e17102e985dc563e1af89e25fa82dc2c78787))
* keep the rail buttons between refreshes so their tooltips show on hover ([9a51cf5](https://github.com/higorabreu/dev-cockpit/commit/9a51cf5331ab28031c166c91ccbc1616efa25157))
* keep the scrollbar at the same distance from the card edge everywhere ([8416b41](https://github.com/higorabreu/dev-cockpit/commit/8416b4100cd2541567cee667cd6861e42ff3527e))
* keep the window on its monitor when toggling full height ([23afad1](https://github.com/higorabreu/dev-cockpit/commit/23afad1630b8d2ec20b6016c31bc8485cbbf2919))
* lay out the project search input and close button in one row ([0e4ea0c](https://github.com/higorabreu/dev-cockpit/commit/0e4ea0c4dca407b3692ca068cb8fa52f8e3abc8c))
* leave the parked agent command out of the packaged cli usage ([b63f935](https://github.com/higorabreu/dev-cockpit/commit/b63f935b7e1c7c5c352444efeed54ef6baaee38c))
* let the project search list scroll with the mouse wheel ([53a02ce](https://github.com/higorabreu/dev-cockpit/commit/53a02ce53b0fc1831c52a4686caed3a5ba73baf3))
* make the node-pty spawn-helper executable after install ([9aeb9d4](https://github.com/higorabreu/dev-cockpit/commit/9aeb9d4693d0e653c45f2d212aea2256c5810a9c))
* measure tooltips from a neutral position and show shortcuts as keys ([448b52a](https://github.com/higorabreu/dev-cockpit/commit/448b52ac5a6fb46c912883e8e04c6a1e5168b056))
* open a duplicated tab in the same directory ([7714b3c](https://github.com/higorabreu/dev-cockpit/commit/7714b3cc4f274525628c92a78a9d447ca1fc3ab4))
* open the rail tooltips to the left and hide the no data text when a report brought something ([c134578](https://github.com/higorabreu/dev-cockpit/commit/c1345782d232432b7ff4b34b64eadeb9fbff7d36))
* read the merge request pipeline from its own endpoint ([e227a2f](https://github.com/higorabreu/dev-cockpit/commit/e227a2f8a76c6e6bb0e3eeee67cc9e299b4c6300))
* rename the language setting to Linguagem in portuguese ([a3c3665](https://github.com/higorabreu/dev-cockpit/commit/a3c3665e5416232f4e78cda1ea210b9c2bf4a159))
* return focus to the filter after clicking a button on the merge requests screen ([76561d5](https://github.com/higorabreu/dev-cockpit/commit/76561d5c2eec158193521e7119d31ff6b4ad41b0))
* treat clearing a missing keyring entry as success ([49addeb](https://github.com/higorabreu/dev-cockpit/commit/49addeb054b6639e4968f092b2e601373fc9290a))
* use Idioma for the language setting in portuguese ([7e85a09](https://github.com/higorabreu/dev-cockpit/commit/7e85a095531df6bdbb7b3d87ca9407961cd0e03e))

## 0.1.0

First version for real use (milestone 1). Verified by automated tests and by running on Electron.

### Added
- Window anchored to the top of the monitor where the mouse is, with the global key (F12 by default) and F11
  for full height; adjustable opacity, dark, light or system theme, and font size.
- xterm terminal with copy on select, a copied notice and paste with the right button.
- Tabs with a context menu (close, close others, duplicate), drag to reorder and Alt+1 to 9.
- Hold menu (right Ctrl, configurable), with a tab picker by recent use.
- Scan of the projects folder and of submodules, ordering by recent use and activity, fuzzy search and
  pinned favorites.
- A rail of icons, always visible, and a collapsible panel with an adjustable width.
- **Sessions:** state of all tabs, a notice and a system notification when a long command finishes.
- **Git:** branch, ticket, staged changes, pull and push, submodules.
- **Environment:** compose containers and their state.
- Settings screen as an overlay, with a validated `settings.json`, restore defaults and everything applying
  immediately.
- Interface in Portuguese and English, switched live.
- Tray icon and start at login (optional).
- A separate, versioned daemon, replaced by itself when it falls behind.
- A `.deb` package with the `dck` command, and `pnpm install:local` to switch versions with one command.

### Measurements (project budgets)
- Cold start 310 ms, key echo 0.8 ms to the screen and 9.8 ms to the first frame, idle memory 218 MB,
  packaged `dck toggle` in 56 ms.

### Known limits
- No Claude approvals banner (deferred) and no agent data in the panel (the code is dormant, D26).
- Linux with X11 only. No Jira or GitLab at that point.

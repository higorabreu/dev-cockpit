# macOS port

## Goal

Run dck on macOS (Apple Silicon and Intel) with the same behavior as on Linux: the hotkey opens the
anchored window with the terminal, panel, views, secret store and daemon. The maintainer has no Mac;
a contributor with one does the testing. So the plan separates what can be verified on its own (Linux
and CI on macOS) from what can only be confirmed on a real Mac, and keeps the second group as small as
possible.

It is not a fork: `core` and the UI stay single. What changes are new adapters, the per-platform choice
at boot and the packaging. A rule of [AGENTS.md](../AGENTS.md): Linux comes first, and nothing here may
make Linux worse.

## Decisions to settle before implementing

| Id | Question | Proposal |
| --- | --- | --- |
| Q1 | Where does CI on macOS run? | **Resolved:** the repository is on GitHub, so macOS CI runs on GitHub Actions |
| Q2 | Default key on the Mac. F12 is volume or a system function on a Mac and only arrives as F12 with `fn` or with "use F1, F2 as standard function keys" on | **Resolved (D42):** `F12` on every platform, `fn+F12` on a Mac keyboard; no per-platform default |
| Q3 | Tab and copy shortcuts: Cmd or Ctrl? | Cmd where Terminal.app and VS Code use it (`Cmd+T`, `Cmd+W`, `Cmd+C/V`, `Cmd+1..9`, `Cmd+,`); Ctrl stays free for the shell. Full table in MAC-T7, to confirm with the tester |
| Q4 | Distribution: only the tester (ad hoc signing) or other people (Developer ID and notarization, US$ 99 a year)? | Only the tester for now. Notarization is MAC-T14, optional |

Q2 and Q3 affect visible behavior, so they are settled before MAC-T4 and MAC-T7. The other tasks do not
depend on them.

## What exists today and is Linux specific

| Piece | Where | On macOS |
| --- | --- | --- |
| Process inspection and the scan for an old daemon through `/proc` | `adapters/linux-proc` | There is no `/proc`. A new adapter with `ps` and `lsof` |
| Secret store through `secret-tool` | `adapters/secret-tool` | Keychain through the `security` command |
| GNOME custom shortcut | `adapters/gnome-shortcuts`, chosen in `shell/src/main.ts` | Already falls back to Electron's `globalShortcut` outside GNOME; the per-platform default and the permission are missing |
| Work area per monitor through `xprop` | `shell/src/platform/linux/x11-workareas.ts` | Already runs only on `linux`; on the Mac Electron's `workArea` is the right one (menu bar and Dock) |
| `.desktop` autostart | `shell/src/platform/linux/xdg-autostart.ts` | A LaunchAgent in `~/Library/LaunchAgents` |
| Anchored window, on top, on all desktops | `shell/src/main.ts` (`alwaysOnTop`, `skipTaskbar`, `setVisibleOnAllWorkspaces`) | `type: 'panel'`, a high level and macOS options. The biggest risk |
| UI shortcuts using `ctrlKey` and `event.key` | `ui/src/platform/shortcuts.ts` | Cmd, and `event.code` in place of `event.key` (on the Mac `Option+1` produces another character) |
| Endpoint and state directory | `adapters/node-net/src/endpoint.ts` | A Unix socket still works; the path limit and the data folder need adjusting |
| `.deb` packaging | `shell/scripts/package-deb.mjs` | A new `.app` and `.dmg` |
| `--no-sandbox` | `shell/src/main.ts` (autostart) and `shell/package.json` | A Linux workaround; do not pass it on the Mac |
| `Menu.setApplicationMenu(null)` | `shell/src/main.ts` | On the Mac, with no menu there is no `Cmd+Q`; a minimal menu |
| PATH | inherited from the environment | An app opened from Finder or launchd has a minimal PATH and does not find `docker`, `claude` or `brew`. See MAC-T6 |

## Acceptance criteria

The "How it is verified" column says **Linux** (a unit test here), **CI** (a macOS runner) or **Mac** (the
tester, following the script of MAC-T12). No criterion is "done" with code alone; the plan keeps the mark
"not verified on a Mac" until the tester runs it.

| Id | Criterion | How it is verified |
| --- | --- | --- |
| C1 | `pnpm install`, `lint`, `typecheck` and `test` pass on macOS arm64 (and x64, if there is a runner), including the real `node-pty` test | CI |
| C2 | The packaged app starts, opens a window, creates a PTY, runs `echo` and exits with code 0 (smoke mode, MAC-T11), with the right binary for the architecture | CI |
| C3 | Secret store: write, read, replace and delete a secret in the Keychain; a missing one returns `undefined`; the secret never shows up in process arguments | Linux (fake runner) and CI (real Keychain) |
| C4 | The tab's directory and the foreground process show up in the panel, and the old daemon is found and shut down after an update | Linux (recorded outputs) and Mac |
| C5 | The configured key opens and closes the window; changing the key in settings applies at once; a refused key goes back to the previous one; `dck toggle` works as plan B | Mac |
| C6 | The window anchors to the top of the cursor's monitor, shows over a fullscreen app and on any desktop, receives the keyboard when it opens and creates no Dock icon | Mac |
| C7 | Tab, copy and paste shortcuts work with the table of Q3; the tooltip shows the Mac symbols | Linux (logic) and Mac |
| C8 | Start with the system turns on and off and opens hidden | Linux (generated file) and Mac |
| C9 | Inside the dck terminal, `git`, `docker` and `claude` are found as in Terminal.app, even with the app opened from Finder | Mac |
| C10 | The budgets of `AGENTS.md` measured on the Mac: key echo in 16 ms, hotkey to window under 100 ms, idle under 300 MB, cold start under 2 s | Mac |
| C11 | Linux does not regress: the full gate and the `.deb` stay the same | Linux |

## Tasks

The order is meant to bring the tester in as late as possible and once per batch.

- [ ] MAC-T0. CI. Create the macOS job on GitHub Actions (install, lint, typecheck, test), now that Q1 is
  resolved. Without it the tasks below have no safety net. (C1)
- [x] MAC-T1. **Spike on the tester's Mac, half an hour.** A script they run and paste back: `pnpm install`,
  `pnpm dev`, and four questions: (a) does a `type: 'panel'` window at a high level open over a fullscreen
  app and receive the keyboard? (b) do F12, `Ctrl+Backtick` and `Option+Space` reach `globalShortcut`
  without asking for Accessibility? (c) does `node-pty` open `zsh`? (d) does `security -i` write an item
  with a quoted value and does `find-generic-password -w` read it back? The result becomes decision D42
  in `docs/decisions.md` and closes Q2. If (a) fails, MAC-T5 changes design before any code is written.
  (C5, C6) Done on 2026-11-13 (macOS 26.5.1, arm64): all four pass, see D42.
- [x] MAC-T2. Platform choice at boot. A `selectPlatform(process.platform)` function in the shell's
  composition root returns the set of adapters (processes, secret store, autostart, shortcut, paths);
  `main.ts` stops importing `linux-proc` and `secret-tool` directly. Drop `--no-sandbox` on the Mac. A test
  with `platform` injected, no `any`. (C11) Done: `shell/src/platform/select-platform.ts`; the Mac keeps the
  Linux adapters until T3, T4 and T8, and only Linux gets `--no-sandbox`. The scanner is a `ProcessScanner`
  port in `core`, and the daemon receives its `SecretStore` from its entry point. Paths stay in `node-net`
  and the GTK work areas stay gated in `main.ts`, since creating them runs `xprop`.
- [ ] MAC-T3. Secret store: `adapters/macos-keychain` (`@dck/adapter-macos-keychain`). The same `SecretStore`
  contract and the same codes (`DCK-SEC-001` tool missing, `DCK-SEC-002` refused). The
  `security add-generic-password` command does not read the value from stdin, and `-w value` shows in
  `ps`; the design is to use `security -i` and send the command line, with the value in escaped quotes,
  through stdin (which is how RubyGems and go-keyring do it). `find-generic-password -w` reads,
  `delete-generic-password` deletes. A missing item exits with code 44 (confirmed in MAC-T1). `security -i` has no escape
  for a line break, and one splits the command and stores the value cut short, so a value with a line
  break is refused before it is sent. A test
  with a fake runner, including a value with quotes, a space and `$`, a refused line break, and an integration
  test that only runs on macOS CI. (C3)
- [ ] MAC-T4. Processes: `adapters/macos-proc` (`@dck/adapter-macos-proc`) behind the same
  `ProcessInspector` and scanner ports. The foreground group through `ps -o tpgid= -p <pid>`, the name through
  `ps -o comm=`, the start through `ps -o lstart=`, the directory through `lsof -a -d cwd -Fn -p <pid>`. The
  scan through `ps -axo pid=,command=` and the process's `DCK_ENDPOINT` through `ps eww -p` (only valid
  for the user's own processes). An injected executor like `docker-cli`'s. The real outputs recorded by
  the tester in MAC-T1 become the test files. Measure the cost of `lsof` and, if it goes past a few tens of
  ms, cache by pid or try `pty.process` from `node-pty` for the name. (C4)
- [x] MAC-T5. The anchored window on the Mac, in `shell/src/electron/dock-window.ts` and `main.ts`, only
  when `platform === 'darwin'`: `type: 'panel'`, `setAlwaysOnTop(true, 'screen-saver')`,
  `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })`,
  no Dock (`LSUIElement` in `Info.plist`, `app.dock?.hide()` in dev mode) and keyboard focus on show (a panel
  does not activate the app by itself; `window.focus()` and `app.focus({ steal: true })`, to validate).
  A minimal menu with `Cmd+Q` and `Cmd+,`. Keep the rest of `createDockController` the same: the height
  and monitor math already belongs to `core`. This is the riskiest task; expect 2 or 3 rounds with the
  tester. (C6) Done, not verified on a Mac: `shell/src/platform/darwin/panel-window.ts`, which
  `selectPlatform` returns as the `window` part (Linux gets `platform/linux/regular-window.ts`, with the same
  calls as before), so `main.ts` has no macOS branch. The panel hides the Dock icon before
  `setVisibleOnAllWorkspaces`, activates the app on focus and calls `app.hide()` after hiding, so the
  keyboard goes back to the previous app. `app.dock?.hide()` runs in every mode; `LSUIElement` in
  `Info.plist` belongs to the packaging, MAC-T10.
- [ ] MAC-T6. Terminal environment and PATH. Find the login shell (`$SHELL`, otherwise `/bin/zsh`) and open
  it as a login shell on the Mac, like Terminal.app. Read the login shell's PATH once at boot
  (`$SHELL -ilc 'printf %s "$PATH"'`, with a 2 s timeout and path validation) and hand the same PATH to
  the daemon, to the adapters that call `git`, `docker` and `claude` and to the PTY, so it does not
  depend on the app having been opened from a terminal. A failure falls back to the inherited PATH and logs
  `warn`. (C9)
- [ ] MAC-T7. Keyboard and tooltip. In `ui/src/platform/shortcuts.ts`, replace `ctrlKey` and `event.key` with a
  `matches(event, shortcut)` function that uses `event.code`, and a primary modifier per platform
  (`metaKey` on the Mac, `ctrlKey` elsewhere), with the table of Q3. In `xterm.js`, `macOptionIsMeta: true`.
  The `data-tip-key` formatter shows `⌘ ⇧ ⌥ ⌃` on the Mac. A new shortcut is born with its mouse path, as
  `AGENTS.md` already says. Tests with fake events; one of them pins that `Option+1` does not become
  another character. (C7) The macOS app menu from T5 has no Edit menu yet, so Cmd+C/V/X/A/Z do not work in
  inputs or the terminal; add the Edit roles together with the Q3 table.
- [ ] MAC-T8. Autostart: `shell/src/platform/darwin/launchd-autostart.ts` with the same shape as
  `createXdgAutostart`: writes `~/Library/LaunchAgents/<label>.plist` (`RunAtLoad`, `ProgramArguments`,
  `EnvironmentVariables` with `DCK_START_HIDDEN`) atomically; turning on and off creates and deletes the
  file. It is chosen because it is testable on Linux; Electron's `app.setLoginItemSettings` changed
  behavior in macOS 13 and stays as an alternative. The settings screen already has the item; on the Mac the
  system shows a background item notice the first time. (C8)
- [ ] MAC-T9. Paths and data. Endpoint: on the Mac `tmpdir()` is `/var/folders/...` and the Unix socket path
  has a limit of 104 bytes (108 on Linux), so test that `.../dck-<uid>/daemon.sock` fits and use a short
  directory (`/tmp/dck-<uid>`, mode 0700) if it does not. The Mac's state directory at
  `~/Library/Application Support/dck`, logs at `~/Library/Logs/dck`. Sweep the code for fixed `~/.config`,
  `/usr`, `/opt` and `XDG_*` and move them into the same paths function. Update the `endpoint.ts` tests.
  (C1, C4)
- [ ] MAC-T10. Packaging: `shell/scripts/package-mac.mjs`, sibling of `package-deb.mjs`, with no heavy packaging
  tool. Copies the `Electron.app` the project already uses, renames the executable and the bundle, writes
  `Info.plist` (identifier, version, `LSUIElement`, `NSHighResolutionCapable`), generates the `.icns` with
  `iconutil` from the PNGs in `assets/`, puts the app in `Contents/Resources/app` and the `dck.mjs` CLI
  beside it, as in the `.deb`. No `.asar`, so `node-pty` needs no `asarUnpack`. Rebuild `node-pty` for the
  runner's architecture (one artifact per architecture, no universal binary, to keep the app light), keep
  `spawn-helper` at mode 755 (the package ships it without execute permission; the root `postinstall` script
  already fixes it for the checkout, and the packaging must do the same for the bundled copy) and check with
  `lipo -archs` that `pty.node` and `spawn-helper` have the right architecture. Ad hoc signing
  (`codesign --force --deep -s -`) with the entitlements `allow-jit`, `allow-unsigned-executable-memory` and
  `disable-library-validation`; a `.dmg` with `hdiutil`. The tester opens it with right click, Open, or
  `xattr -dr com.apple.quarantine`. (C2)
- [ ] MAC-T11. Smoke mode and diagnostics. A `DCK_SMOKE=1` variable makes the app start, create the window, open
  a PTY, run `echo ok`, talk to the daemon, print a JSON (platform, architecture, versions, paths, socket
  length, resolved PATH, Keychain ok, shortcut registered) and exit with 0 or 1. CI runs this mode on the
  generated `.app` (C2). The same JSON becomes the `dck doctor` command, which the tester pastes back so the
  maintainers can see their Mac without guessing. A new CLI command: confirm before implementing. (C2, C5)
- [ ] MAC-T12. A script for the tester and measurements. A `docs/macos-testing.md` file with about 12 steps,
  each with its expected result: open, the hotkey twice, change the key, paste and copy, open a tab in
  another folder, `docker ps` and `claude` inside the terminal, another app in fullscreen, a second
  monitor, restart and check autostart, close and `dck toggle`. Measurements with `DCK_LOG_DOCK=1`,
  `ps -o rss` of the app and the daemon and the cold start time. Problems come back grouped by round.
  (C5, C6, C9, C10)
- [ ] MAC-T13. Close: a new decision in `docs/decisions.md` that records the port as built (the window, secret
  store and PATH choices; D42 is the spike's), the "macOS packaging" item leaves the backlog of
  `docs/roadmap.md`, a Mac section in the `README` and check the full gate. (C11)
- [ ] MAC-T14. Optional, only if Q4 asks for distribution: a Developer ID certificate, signing with the hardened
  runtime on every nested executable (`pty.node`, `spawn-helper`, Electron's helpers), notarization
  (`@electron/notarize`), secrets in CI, manual update by download.

## Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| The `panel` window does not receive the keyboard or does not show over fullscreen | The Guake experience does not exist on the Mac | MAC-T1 before any code; plan B: a regular high-level window with the Dock hidden |
| The F12 `globalShortcut` does not fire or asks for Accessibility | No key to open | Q2 and MAC-T1; plan B is `dck toggle` bound to macOS Shortcuts or another launcher |
| `ps eww` does not show the environment of some process | The old daemon is not found after an update | Fall back to scanning only by argument and by socket; the protocol already has a version (D25) |
| `lsof` is slow on every directory read | The panel lags | Cache by pid; an alternative with `pty.process` |
| `node-pty` with the wrong architecture or without execute permission | The terminal does not open on the Mac | `lipo` and `chmod` in packaging; a check in smoke mode |
| Gatekeeper blocks the ad hoc app | The tester cannot open it | The `xattr` instruction in the script; notarization in MAC-T14 if it becomes distribution |
| launchd's minimal PATH | `docker` and `claude` vanish in the terminal | MAC-T6 and C9 |
| The minimum macOS version Electron 45 accepts | A tester with an old Mac cannot run it | Confirm their version in MAC-T1 and in the Electron documentation |

## Research sources (2026-11-12)

Third-party material and documentation mirrors; whatever depends on a real Mac is marked "to confirm".

- [Electron: globalShortcut](https://www.electronjs.org/docs/latest/api/global-shortcut). Only media keys
  require Accessibility trust; F12 is not on the list, and registration may fail without an error, to confirm on
  the Mac.
- [Electron: window above fullscreen on mac (#14122)](https://ayakael.net/mirrors/electron/commit/b89848d683b4ed58adf69d5c4da3a074775fb8d5),
  [visibleOnFullscreen (#24956)](https://ayakael.net/mirrors/electron/commit/53668445bac8a9cd602300fe13f57bd2c01e8035) and
  [skipTransformProcessType (#27200)](https://github.com/electron/electron/pull/27200).
- [Electron: panel support for BrowserWindow (#34388)](https://ayakael.net/mirrors/electron/commit/21ef8501e7c71cd8d56828e21d310d07f9d86510) and
  [do not activate the app when showing a panel (#41844)](https://ayakael.net/mirrors/electron/commit/1b6e7768fed40acb137e0a7dd0ecb4ce70be7d64).
  There is a report that the window below loses focus when a panel is shown by a global shortcut, to validate in
  MAC-T1.
- [Apple Developer Forums: a window over fullscreen Spaces](https://developer.apple.com/forums/thread/26677)
  suggests the accessory activation policy.
- [RubyGems: the Keychain backend with `security -i`](https://docs.ruby-lang.org/en/master/Gem/CredentialStore/MacOSBackend.html) and
  [go-keyring](https://www.github.com/zalando/go-keyring/blob/master/keyring_darwin.go): the value does not go
  through an argument. The behavior of `-w` with no value reading from a pipe is not confirmed.
- [An example of `proc_pidinfo` and tpgid on macOS](https://docs.rs/crate/herdr/0.1.0/source/src/platform/macos.rs)
  and the `ps` page with the `tpgid` field. Nothing found about the cost of `lsof`.
- [node-pty: `spawn-helper` without execute permission and architecture](https://gitcode.com/OpenBMB/PilotDeck/blob/main/ui/scripts/fix-node-pty.js),
  [a bug with only x64 packaged](https://claudeissues.com/issue/92303-bug-claude-desktop-macos-still-bundles-darwin-x64-only-node-pty-triggers-rosetta),
  [`@electron/universal` and `singleArchFiles`](https://socket.dev/npm/package/@electron/universal/overview/3.0.4).
- [electron-builder: notarization and hardened runtime](https://www.electron.build/docs/notarization) and
  [macOS](https://www.electron.build/docs/mac). Used only for MAC-T14; the plan uses its own script.
- [Electron: `setLoginItemSettings` and SMAppService on macOS 13](https://shayanhabibi.github.io/fable-electron-docs-api/reference/fable-electron-main-app-setloginitemsettings-settings.html),
  a third-party mirror; that is why MAC-T8 uses a LaunchAgent.

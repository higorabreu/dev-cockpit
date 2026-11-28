# Windows port

Status: planned, not started (2026-11-28).

## Goal

Run dck on Windows 10 and 11 (x64; arm64 later) with the Linux behavior where Windows allows it: the hotkey
opens the anchored window with the terminal, panel, views, secret store and daemon, and `dck` works from any
terminal. Linux and macOS must not regress: `core` and the UI stay single; what changes are new adapters,
the per-platform choice in `selectPlatform`, a few portability fixes and the packaging.

A goal of its own: **as few requirements as possible for the user.** Nothing beyond Windows itself is
required to run the app. Git, Node, pwsh, Git Bash and WSL are used when present and never asked for.

## Decisions to settle before implementing

| Id | Question | Proposal |
| --- | --- | --- |
| W1 | Default shell | **pwsh.exe if it is in the PATH, otherwise Windows PowerShell 5.1 (`powershell.exe`), which every Windows has.** Git Bash, cmd and each WSL distribution are detected and offered as options in Settings (`terminal.shell`), like Windows Terminal's profiles. No shell is required |
| W2 | Default hotkey. Windows reserves F12 for the debugger and `RegisterHotKey` refuses it, so the D42 default (`F12` everywhere) cannot register | **Resolved (2026-11-28):** `Ctrl+\`` on Windows; Linux and macOS keep `F12`. Recorded as a decision when WIN-T9 lands |
| W3 | Distribution format | **A portable `.zip` per release, installed by `npx @devcockpit/install`** (which already does this job for the `.deb` and the `.dmg`, D76) into `%LOCALAPPDATA%\Programs\Dev Cockpit`, with a Start menu shortcut and `dck` added to the user PATH; no admin rights. An NSIS `setup.exe` for people without Node is a later task (WIN-T15). MSI, MSIX and Squirrel are not used (see "Formats considered") |
| W4 | Code signing | None for now. A file that npx downloads carries no Mark of the Web, so SmartScreen does not prompt; a browser download of an unsigned `.exe` does. Signing (Azure Trusted Signing or a certificate) only with WIN-T15 |
| W5 | CI | A `windows-latest` entry in the `verify` matrix of `ci.yml`, plus a packaging job like the `.deb`'s. Free on a public repository; on a private one it consumes the plan's minutes (Windows minutes cost more than Linux ones) |

### Formats considered (W3)

| Format | What it is | Why not now |
| --- | --- | --- |
| Portable `.zip` | The app folder, unzipped anywhere | **Chosen**, with the npm installer doing the shortcut and the PATH |
| NSIS `setup.exe` | Classic wizard installer, per user or per machine, uninstaller in Settings > Apps | Good second step for people without Node; needs `makensis` in CI and, to avoid SmartScreen, signing |
| Squirrel.Windows | Electron Forge's default; per user, built-in updates | Fixed install folder, quirky shortcuts, and the project avoids heavy packaging tools |
| MSI (WiX) | For corporate deployment (GPO, Intune); usually per machine with admin | Heavier to build and maintain; no demand |
| MSIX | Modern package, Store friendly | Requires signing and virtualizes AppData and the registry, which fights the daemon, the named pipe and `settings.json` |
| winget | Not a format: a manifest in `microsoft/winget-pkgs` pointing to the zip or the setup | A later, outward-facing step |

## What exists today and is Unix specific

Found by reading the code on 2026-11-28; the paths are where the change goes.

| Piece | Where | On Windows |
| --- | --- | --- |
| Line endings: no `.gitattributes`, and Git for Windows defaults to `core.autocrlf=true`, so the checkout has CRLF and Biome (LF) fails on every file | repository root | `.gitattributes` with `* text=auto eol=lf` |
| `pnpm dev`: socket at `/tmp/dck-dev/daemon.sock` (not a valid pipe on Windows) and `node_modules/.bin/electron` (a `.cmd` there) | `scripts/dev.mjs` | A pipe name for dev and `electron`'s own path from `require('electron')` |
| `pnpm install:local` | `scripts/install-local.sh` | Bash only; replaced on Windows by the zip and the npm installer |
| node-pty is rebuilt for Electron with `@electron/rebuild`, which on Windows needs Visual Studio Build Tools and Python | `shell/scripts/build.mjs` | node-pty 1.x is N-API and ships Windows prebuilds; use them and skip the rebuild on Windows if they load in Electron (WIN-T1 confirms) |
| The daemon's folder: `mkdirSync(dirname(endpoint))` and the log beside the socket. With the pipe `\\.\pipe\dck-daemon` this tries to create `\\.\pipe\` and throws at boot | `shell/src/main.ts` (`startDaemonProcess`), `adapters/node-net/src/endpoint.ts` (`defaultLogDir`) | No folder for a pipe; logs in `%LOCALAPPDATA%\dck\logs` |
| One pipe name for every user and profile (`\\.\pipe\dck-daemon`); pipes are machine wide, so a second user or the dev profile would collide | `endpoint.ts` | `\\.\pipe\dck-<user>-daemon`, and `DCK_ENDPOINT` for dev |
| The folder privacy check reads `uid` and mode bits | `adapters/node-net/src/ipc.ts` | Already skipped for a pipe; keep it so and test it |
| The daemon is spawned `detached`; on Windows that opens a console window | `shell/src/daemon/daemon-launcher.ts` | `windowsHide: true` |
| Default terminal `env.SHELL ?? '/bin/bash'` | `shell/src/platform/select-platform.ts` | W1 detection |
| ConPTY reflows and redraws differently; xterm.js needs to know | `ui/src/terminal/terminal-session.ts` | `windowsPty: { backend: 'conpty', buildNumber }` from the host |
| Process inspection through `/proc` (Linux) and `ps`/`lsof` (Mac): foreground process, its cwd, the old daemon scan | `adapters/linux-proc`, `adapters/macos-proc` | No foreground process group and no cheap way to read another process's cwd. A new `adapters/windows-proc`: the process tree under the shell for the foreground program and the agent; the scan by command line. The cwd comes from the shell (next row) |
| The tab's directory | `shell/src/inspectors/*` through `ProcessInspector` | Shell integration: dck starts PowerShell and Git Bash with a small prompt hook that reports the directory as OSC 7 (or OSC 9;9, which Windows Terminal uses); the UI already parses OSC 7501 in `ui/src/terminal/program-status.ts` |
| Agent recognition by process name | `core/src/ports/agent.ts` profiles | Names arrive as `claude.exe`, `node.exe`; drop a `.exe` suffix before matching |
| Secret store through `secret-tool` / Keychain | `daemon/src/secret-store.ts` | Windows Credential Manager in a new `adapters/windows-credential` (see WIN-T6 for the two options) |
| Autostart through a `.desktop` file / LaunchAgent | `shell/src/platform/{linux,darwin}` | `app.setLoginItemSettings` (the `Run` registry key) behind the same `Autostart` port |
| GNOME custom shortcut | `adapters/gnome-shortcuts` | Not used; Electron's `globalShortcut` (`RegisterHotKey`) works on Windows, with W2 |
| Work areas through `xprop` | `shell/src/platform/linux/x11-workareas.ts` | Not used; Electron's `workArea` is right (taskbar) |
| System fonts through `fc-list` | `shell/src/platform/linux/system-fonts.ts` | `noSystemFonts` first; later read the font folder or registry. Default font list must include `Cascadia Mono` and `Consolas` |
| Anchored window: `alwaysOnTop`, `skipTaskbar`, `setVisibleOnAllWorkspaces` | `shell/src/main.ts`, `platform/linux/regular-window.ts` | The regular window works; `setVisibleOnAllWorkspaces` does nothing on Windows (the window stays on its virtual desktop) and focus after a hotkey must be checked against Windows' foreground lock |
| The packaged `dck` command (`#!/bin/sh` wrapper) | `shell/scripts/package-*.mjs`, `mac-bundle.mjs` | A `dck.cmd` that runs the bundled Electron with `ELECTRON_RUN_AS_NODE=1` |
| Updates | `platform/linux/deb-installer.ts` | `updateInstaller: undefined`: the notice only points to the release page, as on the Mac |
| npm installer: `apt` and Mac targets | `packages/install/src` | A Windows target: download the zip, unpack, shortcut, user PATH |
| Tests with `/bin/echo`, `/bin/sh`, `/tmp`, file modes | `adapters/node-pty`, `linux-proc`, `macos-proc`, `shell/src/electron/host-bridge`, `platform/darwin/login-path`, `select-platform`, `node-fs` | Platform guards (`it.skipIf`) for the Unix-only ones and a Windows twin where the behavior matters (node-pty with `cmd.exe /c`) |

What needs nothing: `core`, the UI keymap (Windows uses the PC table of D51), GitHub, GitLab and Jira
connectors, node-git and docker-cli (they call `git` and `docker`, which are `.exe` in the PATH), the config
and state folders (`defaultConfigDir` and `defaultStateDir` already know `%APPDATA%` and `%LOCALAPPDATA%`),
`short-path.ts` (already keeps Windows separators), the tray icon and `globalShortcut`.

## Gaps accepted in the first version

Stated here so nobody takes them for bugs; each one has a task or a note to close it later.

| Gap | Effect | Closed by |
| --- | --- | --- |
| No in-app update | The update notice opens the release page; the user runs `npx @devcockpit/install` again | WIN-T15 (NSIS or another updater) |
| Unsigned | A browser download of a future `setup.exe` shows SmartScreen; the npx path does not | WIN-T15 |
| No arm64 build | Windows on ARM runs the x64 build under emulation | A second runner when there is demand |
| WSL tabs: the panel knows less | A WSL tab opens and works, but its directory is a Linux path and git runs on the Windows side, so Git rows and the review may show nothing for repositories inside WSL | WIN-T16, after real use |
| cmd tabs report no directory | cmd has no prompt hook as flexible as PowerShell's; the panel shows the start folder | Accepted (`PROMPT` with `$E]9;9;$P$E\` may do it; to try) |
| One virtual desktop | The window shows on the desktop where it was last opened, unlike Linux and Mac | Accepted; Windows has no public API for "all desktops" |
| No system font list | Settings offers the cockpit's fonts and a free text field | WIN-T14 |
| `pnpm install:local` does not exist on Windows | Contributors use `pnpm dev` or the zip | Accepted |
| A pipe name can be taken first by another account | On a shared machine another user could create `dck-<user>-daemon` before the daemon and stand in for it; the default pipe permissions keep that user from sending requests to a real daemon | Accepted for a single-user PC; a check of the pipe's owner needs a native call Node lacks |

## Acceptance criteria

"How it is verified" says **Unit** (a test that runs everywhere), **CI** (the Windows runner) or **Win** (a
manual script on a real Windows machine, WIN-T13).

| Id | Criterion | How it is verified |
| --- | --- | --- |
| C1 | `pnpm install`, `lint`, `typecheck` and `test` pass on Windows x64 with no Visual Studio Build Tools installed, including the real node-pty test | CI |
| C2 | `pnpm dev` opens the development cockpit on Windows, apart from an installed one | Win |
| C3 | The packaged app starts, opens a window, creates a PTY, runs a command and exits 0 in smoke mode | CI |
| C4 | The default shell follows W1; Settings lists the detected shells and a new tab uses the chosen one | Unit (detection with a fake PATH) and Win |
| C5 | The hotkey of W2 opens and closes the window and gives it the keyboard over another app, including a fullscreen one; changing it applies at once; a refused key goes back and says so; `dck toggle` works | Win |
| C6 | The daemon starts with no console window, `dck ping` answers, two Windows users and the dev profile get separate pipes, and an old daemon is found and stopped after an update | Unit and Win |
| C7 | Secret store: write, read, replace and delete in the Credential Manager; a missing one returns `undefined`; the value never shows in a command line | Unit (fake) and CI (real) |
| C8 | The panel shows the tab's directory for PowerShell and Git Bash and the foreground program; Claude Code and Codex mark their tab | Unit (recorded outputs) and Win |
| C9 | Start with Windows turns on and off and opens hidden | Unit and Win |
| C10 | `npx @devcockpit/install` on Windows installs with no admin rights, creates the Start menu entry and makes `dck` work in a new terminal; running it again updates in place | Unit and Win |
| C11 | The AGENTS.md budgets measured on Windows: key echo 16 ms, hotkey to window under 100 ms, idle under 350 MB, cold start under 2 s | Win |
| C12 | Linux and macOS do not regress: the full gate on both runners, the `.deb` and the `.dmg` unchanged | CI |

## Tasks

Estimates are focused working days for one developer, with the uncertainty in the range. Each phase ends
in something usable, so the work can stop after any of them.

### Phase 0: the repository works on Windows (2 to 3 days)

- [x] WIN-T0. Toolchain on the developer's machine: Node 24 (`.nvmrc`; this machine has 23) and pnpm 9 through
  `corepack enable`. Documented in CONTRIBUTING.md. Done: `nvm install 24` (nvm-windows) and `corepack enable`
  in that version; CONTRIBUTING.md still to update with WIN-T14. Electron's binary was not downloaded by
  `pnpm install`; it arrived with `node install.js` in its package (to check with `pnpm dev`, WIN-T4).
- [x] WIN-T1. **Spike, half a day.** `.gitattributes` (`* text=auto eol=lf`) and a renormalized checkout;
  `pnpm install`, `lint`, `typecheck`, `test`; list what fails. Check whether node-pty's Windows prebuild
  loads in Electron 45 without `@electron/rebuild`; if it does, `build.mjs` skips the rebuild on `win32`,
  otherwise Build Tools become a contributor requirement (never a user one). Open a PowerShell PTY from
  Electron and type in it. Check that `globalShortcut` refuses F12 (W2). The result becomes a decision in
  `docs/decisions.md`. (C1) Done on 2026-11-28, D96: the prebuild loads in Electron and runs PowerShell;
  `@electron/rebuild` fails without Build Tools, so `build.mjs` must skip it on Windows (WIN-T4); F12 is
  refused and `Ctrl+\`` registers. Lint and typecheck pass. 95 tests fail in 27 files, by cause:
  - Unix sockets in a temporary folder, refused by the folder privacy check (no `uid` on Windows): `node-net`
    `ipc`, `daemon`, `cli` (`agent-signal`, `cli`, `daemon-command`), `shell/scripts/cli-bundle`. A pipe name
    in the tests on Windows.
  - Paths joined with the host's separator while the test injects another platform: `node-net` `endpoint`,
    `platform/linux/xdg-autostart`, `install` `mac` and `node-system`. The functions should join with
    `path.posix` or `path.win32` by the injected platform.
  - Unix programs and features: `node-pty` `pty-host` (`/bin/*`) and `spawn-helper` (mode bits), `linux-proc`,
    `platform/darwin/login-path`, `shell/scripts/mac-bundle` (`/bin/sh`), `platform/linux/wayland-bounds`,
    symbolic links and modes in `node-fs`, `node-walk`, `node-fetch` `release-download`.
  - Paths compared as strings with `/`: `node-git` (`git-base`, `git-files`, `git-review-notes`,
    `untracked-file`), `shell/src/electron/host-bridge`, `shell/src/files/files-bridge`.
  - Slow on Windows (timeouts at 5 s and 10 s, git spawned many times): `core/src/files/merge` and `node-git`
    `git-diff`.
- [x] WIN-T2. Portable tests: guard the Unix-only tests, add Windows twins for node-pty (`cmd.exe /c echo`,
  exit code, resize, cwd) and endpoint. (C1, C12) Done on 2026-11-28: the full gate passes on Windows
  (3269 tests, 34 skipped), three runs in a row. Two production bugs came out of it: git's paths (root,
  superproject, git folder) arrive with forward slashes on Windows, so submodules were never read in their
  own scope (`systemPath` in `node-git`); and two saves of the views cache at once lost one on Windows (saves
  now run in turn). Paths of Linux and macOS code are joined with `node:path/posix`, and `endpoint.ts` joins
  by the injected platform. The daemon tests use `temporaryEndpoint` from `node-net`, a named pipe on Windows.
  Tests that need symbolic links run where the system allows them (Developer Mode, an administrator, CI), and
  the rest of the Unix-only ones are skipped on Windows with the reason beside them. Vitest gets 30 s per test
  and 60 s per hook on Windows, where git and the terminal start processes far more slowly. Still unverified on
  Linux and macOS: the CI run (WIN-T3) is the check that nothing changed there.
- [ ] WIN-T3. CI: `windows-latest` in the `verify` matrix (W5). (C1, C12) The matrix entry is in; the box is
  ticked after the first green run, which needs the branch pushed.
- [x] WIN-T4. `pnpm dev` on Windows: pipe endpoint for dev, Electron's path from the package, no
  `--no-sandbox`. (C2) Done on 2026-11-28: `build.mjs` skips `@electron/rebuild` on Windows, `pnpm dev` opens the
  window on `\\.\pipe\dck-dev` with the log in `%TEMP%\dck-dev`, a PowerShell tab starts, and `pnpm dev:dck ping`
  and `toggle` answer. Brought forward from WIN-T5: the shell creates no folder for a pipe and the daemon's log
  defaults to `%LOCALAPPDATA%\dck\logs`. The per-user pipe name is still WIN-T5.

### Phase 1: the app runs (5 to 7 days)

- [x] WIN-T5. Daemon and IPC: per-user and per-profile pipe name, no folder created for a pipe, logs in
  `%LOCALAPPDATA%\dck\logs`, `windowsHide: true`, `SIGTERM` paths reviewed (Windows only kills). (C6)
  Done on 2026-11-28:
  - The pipe is `\\.\pipe\dck-<USERNAME>-daemon`. Not per profile, as on Unix, where the profile only
    names the secrets; a development run sets its own `DCK_ENDPOINT`.
  - The daemon starts with `windowsHide`, and git and docker run with it from the window's process; without it
    Windows opens a console for each.
  - `SIGTERM` needs no change: the daemon stops cleanly through the `shutdown` request; on Windows the signal
    kills at once, and a pipe, unlike a socket file, leaves nothing behind.
  - Gap: the stale-daemon search (`processScanner`) finds nothing on Windows until it has an adapter there
    (WIN-T10). It only matters for a daemon older than `shutdown`, which never shipped on Windows.
  - Gap: another account on the same machine could create a user's pipe name first. The default pipe
    permissions keep it from sending requests to a real daemon, but a squatter could stand in for the daemon.
    Node cannot check the server's owner. Accepted for a single-user PC; noted in the gaps table.
- [x] WIN-T6. Secret store, `adapters/windows-credential` with the `SecretStore` contract and codes.
  Two options, to pick in the spike: (a) `@napi-rs/keyring`, a prebuilt N-API binding (fast, one native
  dependency, no build tools); (b) PowerShell calling `CredRead`/`CredWrite` with the value on stdin (no native
  dependency, about 300 ms per call, cached by the daemon). Proposal: (a). (C7) Done on 2026-11-28 with (a),
  D97: `createCredentialStore` loads `@napi-rs/keyring` on the first secret; the window and the daemon use
  it on `win32`; the bundles leave it external and `build.mjs` copies it into `dist/node_modules` on
  Windows. The real store test runs in CI (`DCK_CREDENTIAL_TEST=1`) and passed locally. For WIN-T12: the zip
  must keep `dist/node_modules/@napi-rs`, and the packaged `dck` CLI must find it beside its bundle.
- [ ] WIN-T7. Shell detection (W1) in `shell/src/platform/win32/shells.ts`: pwsh, powershell, Git Bash (from
  `git.exe`'s folder or the registry), cmd, WSL distributions (`wsl.exe -l -q`, UTF-16 output). A
  `terminal.shell` setting with the translated labels in `en.ts` and `pt-BR.ts`. (C4)
- [ ] WIN-T8. Terminal on ConPTY: `windowsPty` in xterm, the build number passed from the host; check paste,
  resize, Ctrl+C, AltGr on an ABNT2 keyboard (AltGr arrives as Ctrl+Alt and must not trigger
  `Ctrl+Alt+Enter`) and Unicode output from PowerShell 5.1 (set UTF-8 output on start). (C4)
- [ ] WIN-T9. Platform wiring: `selectPlatform` gets a `win32` branch (window, autostart through
  `setLoginItemSettings`, no desktop shortcut, `noSystemFonts`, no update installer); the W2 default key;
  focus after the hotkey. (C5, C9)

### Phase 2: the panel knows what runs (4 to 6 days)

- [ ] WIN-T10. `adapters/windows-proc`: the process tree under the tab's shell (foreground program = the
  newest descendant that is not a console host) and the scan for an old daemon by command line. Options:
  `@vscode/windows-process-tree` (native, N-API, what VS Code uses) or one batched PowerShell/CIM query per
  poll like `macos-proc` batches `ps`. Measure both against the 10 ms batch window; agent names without
  `.exe`. (C6, C8)
- [ ] WIN-T11. Shell integration for the directory: a prompt hook for PowerShell (both editions) and Git
  Bash that prints OSC 7, injected at spawn without touching the user's profile; the UI reads it and the host
  prefers it to the inspector's cwd when present. Useful on Linux and Mac too, but kept Windows-only until
  measured there. (C8)

### Phase 3: other people can install it (3 to 5 days)

- [ ] WIN-T12. `shell/scripts/package-win.mjs`, sibling of `package-mac.mjs`: copy Electron, rename
  `electron.exe` to `Dev Cockpit.exe`, set the icon and version (rcedit), place the app, node-pty and `dck.cmd`,
  zip it as `dev-cockpit_<version>_win32-x64.zip`. A smoke mode (shared with MAC-T11 if it lands first) run in
  CI on the zip; the release workflow attaches it. (C3)
- [ ] WIN-T13. npm installer Windows target in `packages/install/src/windows.ts`: download, verify, unpack to
  `%LOCALAPPDATA%\Programs\Dev Cockpit`, Start menu shortcut, `dck` in the user PATH (registry
  `HKCU\Environment`, then broadcast the change), stop a running cockpit before replacing. A script for
  the manual Windows test (`docs/windows-testing.md`) with the budgets measured. (C10, C11)
- [ ] WIN-T14. Close: README section, `docs/roadmap.md` (Windows packaging leaves the backlog), a decision
  in `docs/decisions.md` for the port's choices, full gate. (C12)

### Later, outside this plan's scope

- [ ] WIN-T15. NSIS `setup.exe`, code signing, in-app update.
- [ ] WIN-T16. WSL as a first-class tab: directory mapped to `\\wsl.localhost\<distro>\...`, git run inside
  the distribution for its repositories.
- [ ] WIN-T17. System font list; arm64 build.

**Total for phases 0 to 3: about 14 to 21 working days.** The biggest uncertainties are WIN-T1 (whether
node-pty needs build tools), WIN-T9 (focus and fullscreen behavior of the anchored window) and WIN-T10 (cost
of reading the process tree).

## Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| node-pty's prebuild does not load in Electron | Contributors need Visual Studio Build Tools | Spike first; CI builds the release, so users never need them |
| Windows' foreground lock keeps the keyboard in the previous app after the hotkey | The Guake experience breaks | The hotkey's own message usually grants the foreground; fallbacks: `setAlwaysOnTop` toggling, `app.focus({ steal: true })` |
| Reading the process tree is slow | The panel lags or burns CPU while hidden | Batch per poll, as macos-proc does; the native module as plan B |
| PowerShell 5.1 starts slowly (about 0.5 to 1 s with modules) | A new tab feels slow | Not dck's start time; pwsh when present; `-NoLogo` |
| ConPTY quirks (reflow, clear screen, mouse) | Visual glitches in the terminal | `windowsPty`; xterm's Windows notes; compare with VS Code's terminal |
| Named pipe squatting by another user | A process of another user could stand in for the daemon | Per-user name; check the server's owner later if multi-user machines matter |
| Antivirus flags an unsigned Electron app or the native modules | The app does not start on some machines | Signing in WIN-T15 if it shows up |

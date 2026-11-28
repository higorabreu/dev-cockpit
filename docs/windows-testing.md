# Manual checks on Windows

What the automated tests cannot see: a real keyboard, the window manager, the feel of the hotkey. Run them on
a real Windows 10 or 11 machine before a release that touches Windows, and tick each one with the build and
the date. Grown task by task during the port ([plans/windows.md](../plans/windows.md)).

Start the development cockpit with `pnpm dev` (key `F9`, its own profile and pipe) unless a check says
otherwise. `pnpm dev:dck ping` must answer `pong` before anything else.

## Shells (WIN-T7)

- [ ] The first tab opens PowerShell 7 when it is installed, otherwise Windows PowerShell (`PS C:\Users\...>`).
- [ ] Settings > Terminal shows a Shell row listing what is installed: PowerShell 7, Windows PowerShell, Git
  Bash, Command Prompt and one `WSL: <name>` per distribution (Docker Desktop's are left out).
- [ ] Picking Git Bash opens it in the next new tab (`$` prompt, `~/.bash_profile` read); tabs already open
  keep their shell.
- [ ] Picking a WSL distribution opens it in the next new tab, starting in the tab's folder as `/mnt/c/...`.
- [ ] Picking Command Prompt opens `cmd.exe` in the next new tab.
- [ ] Back to Default: the next tab opens the first shell in the list again.
- [ ] With a WSL distribution chosen, quit and start the cockpit again: the first tab opens that distribution.
- [ ] The Shell row does not appear on Linux or macOS (check on either if at hand).

## Terminal on ConPTY (WIN-T8)

Checked by script on 2026-11-28 (node-pty and PowerShell 5.1): accents from PowerShell, cmd and node, also
piped through PowerShell, and Ctrl+C stopping `ping -t`. What needs a person:

- [ ] Type `ação`, `é`, `ç`, `~`, `^` and `` ` `` with the ABNT2 dead keys: each shows once, in place.
- [ ] AltGr on ABNT2 types `/` (AltGr+Q), `?` (AltGr+W), `°` (AltGr+E), `²` and `³` (AltGr+2, AltGr+3) and
  runs no cockpit shortcut.
- [ ] `git log -3` and `git log -3 | Select-String .` show accented commit messages correctly.
- [ ] Ctrl+C stops `ping -t 127.0.0.1` and the prompt comes back.
- [ ] Paste: Ctrl+V (PowerShell's own), Ctrl+Shift+V and the right click paste a multi-line text without
  running each line at once (PowerShell asks or pastes it as one block).
- [ ] Selecting text copies it; Ctrl+Shift+C copies too.
- [ ] Resize the window from its bottom edge and toggle full height (F11): the prompt redraws without
  repeated or broken lines, also with a long line wrapped.
- [ ] A full-screen program (`vim` in Git Bash or WSL, `htop` in WSL) draws, resizes and quits cleanly.
- [ ] Clear (Ctrl+Shift+K) empties the screen and the scrollback.

## Window, key and start with Windows (WIN-T9)

Not checked by script: the session had no desktop to read the foreground window from.

- [ ] Installed run (or `pnpm dev` with `DCK_KEY` unset, after quitting any other cockpit): Ctrl+` shows and
  hides the window. On ABNT2 it is the key left of 1 (`'` and `"`), the same place as on a US keyboard.
- [ ] After the key shows the window, typing goes straight to the terminal with no click, also when another
  app (a browser, VS Code) had the focus.
- [ ] `pnpm dev:dck toggle` from another terminal shows the window with the keyboard in it (Windows may refuse
  the focus to a window that did not get the key; note whether it does).
- [ ] The hold trigger (Right Ctrl held) opens its menu and the menu takes the keys.
- [ ] The window stays above other windows, has no taskbar button and hides when another app is clicked.
- [ ] F11 toggles full height; the bottom edge resizes it and the height is kept after a restart.
- [ ] Settings > General: Start with the system on adds Dev Cockpit to Task Manager's Startup apps; after
  signing out and in, the cockpit runs hidden and the key shows it. Off removes it.
- [ ] Settings > Shortcuts: setting the window key to F12 is refused with a notice and the old key keeps
  working; the reset button brings back Ctrl+`.

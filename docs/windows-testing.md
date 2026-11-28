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

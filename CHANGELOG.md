# Changelog

Newest first. Versions stay at 0.x while real use goes on. From the next release this file is generated
from Conventional Commits.

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

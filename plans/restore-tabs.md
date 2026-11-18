# Restore the tabs on start

**Status:** Done, shipped in 0.9.0 (D62, D64).

The maintainer wants the open tabs back when the cockpit starts again, each in its folder and with the
name the user gave it; a program that ran in a tab (an agent) does not come back (2026-11-17).

Decided with the maintainer:

- The tabs come back by themselves on start; a setting in the Window group turns it off (on by default).
- Each tab keeps the terminal's current folder (it follows `cd`), not the one it opened in. A folder that
  no longer exists opens the home folder.

## Tasks

- [x] T1. Core: `SavedTabs` and `tabsToSave` (`core/src/tabs/saved-tabs.ts`): order, active tab, current
  folder, the name a tab opened with when it was not the counter's (a project's), the user's name.
- [x] T2. Port: `tabs.saved()` and `tabs.save()` on the host API, with their channels.
- [x] T3. Setting `window.restoreTabs` (default true), its row and texts in both catalogs.
- [x] T4. Shell: the saved tabs file in the app's data folder, validated with zod and written atomically;
  the bridge's two channels; a terminal asked for a folder that is gone starts in the home folder.
- [x] T5. Window: saves after every change of the tabs and every `cd` the watcher sees, debounced and only
  when something changed; on start, opens the saved tabs, names them and activates the one that was.
- [x] T6. Decision D64, the README, a check in the real app across two starts.

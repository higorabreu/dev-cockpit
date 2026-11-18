---
paths:
  - "packages/core/src/settings/**"
  - "packages/shell/src/settings/**"
  - "packages/ui/src/settings/**"
---

# Settings

- The single source is `settings.json` in the app's data directory, read and written only by the host
  (`shell/src/settings/settings-store.ts`) and validated by the model in `core/src/settings/settings.ts`. An
  invalid field goes back to its default by itself; a number out of range is clamped. Never use
  `localStorage` for a user preference.
- The file is JSON with comments (D65), read and edited through the `SettingsText` port
  (`@dck/adapter-jsonc`): a write changes only the values that changed and keeps the user's comments and
  layout; a new file is plain pretty JSON. A file that is not valid is never written over.
- One exception (D41): `dck ext enable|disable` writes `extensions.disabled` and nothing else, atomically,
  through the same port. The window watches the file (`shell/src/settings/settings-watch.ts`) and applies
  any field saved by hand at once (`store.reload`); a value the model does not use as written is listed on
  the screen by `settingsIssues` in `core/src/settings/settings-file.ts`.
- **New setting:** add the field to `settingsSchema` with a default and limits, add the row in
  `ui/src/settings/settings-view.ts` with its text in both catalogs, and react to the change in
  `settings.onChange`.
- `DCK_*` environment variables win over the file and show as locked on the screen
  (`shell/src/settings/env-overrides.ts`).
- A change the system may refuse (the global shortcut) goes through the store's `veto` and returns to the
  previous value. Everything applies immediately, with no restart when possible.
- **Keys (D69):** `shortcuts.keys` holds only the actions the user changed, as chord text read by
  `parseChord` (`core/src/settings/shortcut-keys.ts`). A new action with a key goes in `SHORTCUT_IDS`, in
  the keymap's defaults for each keyboard and in a group of `ui/src/settings/shortcuts-page.ts`; its label
  and its tooltip (`data-tip-shortcut`) always come from the keymap, never from a written key.

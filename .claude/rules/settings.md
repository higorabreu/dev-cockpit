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
- One exception (D41): `dck ext enable|disable` writes `extensions.disabled` and nothing else, atomically,
  keeping every other field, and leaves a file that is not valid JSON untouched. The window watches the file
  (`shell/src/settings/settings-watch.ts`) and applies only that list at once.
- **New setting:** add the field to `settingsSchema` with a default and limits, add the row in
  `ui/src/settings/settings-view.ts` with its text in both catalogs, and react to the change in
  `settings.onChange`.
- `DCK_*` environment variables win over the file and show as locked on the screen
  (`shell/src/settings/env-overrides.ts`).
- A change the system may refuse (the global shortcut) goes through the store's `veto` and returns to the
  previous value. Everything applies immediately, with no restart when possible.

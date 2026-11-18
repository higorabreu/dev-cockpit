# Custom shortcuts: every interface key and the hold menu trigger

Until now only the global key and the hold menu key (a short list of modifiers) could be changed; the
interface keys were fixed per keyboard (D51, D68) and the README listed key remapping as not done. The
maintainer settled the design on 2026-11-18, on top of the Mac keys branch (PR #83). Recorded as D69.

Decided with the maintainer:

- Every action of the keymap is customizable from the Shortcuts page: each row of the reference list
  becomes editable. Clicking its keycaps (a button) or Enter on it records the next chord in place
  ("Press the new key (Esc cancels)", the global key's texts and its `inputGate`), with no layout shift
  between states. Each row has the reset (↺) of the other settings and "Restore all defaults" resets them
  too. Keys inside panels (the review's single keys, arrows in lists) stay out.
- `settings.json` keeps only the actions the user changed, `"shortcuts": { "keys": { "newTab": "Ctrl+T" } }`,
  in an accelerator text readable by hand (`Ctrl`, `Alt`, `Shift`, `Super`; `Cmd` and `Option` are the Mac's
  names for the same modifiers). Validated with zod; an invalid or unknown entry is dropped and shows as a
  settings.json warning. Defaults stay per keyboard; a custom chord replaces all the default chords of its
  action. Changes apply at once.
- A letter, digit or other typing key needs a modifier; bare F keys and other keys that do not type are
  allowed.
- A chord that belongs to another action, to the hold trigger or to the global key shows inline
  "Already used by {action}" with Swap and Cancel; Swap gives the other one this row's previous key. No
  modal.
- A chord the shell uses (PC: Ctrl and a letter or symbol without Shift or Alt; Mac: any Control chord) is
  allowed, with a note under the row: "{key} no longer reaches the terminal."
- Labels follow the custom keys everywhere at once: reference rows, tooltips (the static ones in
  index.html come from the keymap), hold menu rows, the review header hints.
- Hold menu trigger: a recorder like the global key. One key that does not type (modifiers, F keys, Caps
  Lock, Scroll Lock, Pause, Insert, the Menu key...) or the middle, back or forward mouse button, stored as
  a code (`ControlRight`, `F13`, `Mouse1`, `Mouse3`, `Mouse4`); the old values stay valid. Held, a mouse
  button opens the wheel like the key, moving selects, releasing runs, Esc cancels, and the button's own
  behavior (middle-click paste, auxclick, back and forward) is suppressed while it is the trigger.
- Every recorder works by keyboard with a visible focus; recording traps nothing else; state is not by
  color alone.

## Tasks

- [x] C1. This plan.
- [x] C2. Core: chord text (`parseChord`, `formatChord`, `chordFromEvent`, the shell rule) and the
  `shortcuts.keys` setting with zod, warnings through `settingsIssues`, tests.
- [x] C3. Core: the hold trigger as a key code that does not type or a mouse button, with the reason a key
  is refused, tests; old values stay valid.
- [x] C4. Keymap: reads the custom keys live, a custom chord wins over the defaults and the tab digits,
  labels follow; tooltips resolve `data-tip-shortcut` through the keymap (index.html, tab bar, review
  header); the review hints redraw on change. Tests.
- [x] C5. Settings: one editable row per action (record, conflict with Swap and Cancel, shell note,
  reset, settings.json warnings, Reset all), texts in both catalogs, styles with no layout shift. Tests.
- [ ] C6. Hold menu: a mouse button as the trigger (open, select, run on release, Esc) and its own
  behavior suppressed. Tests.
- [ ] C7. Settings: the hold trigger recorder (key or mouse button, refusals, conflicts), labels in both
  catalogs. Tests.
- [ ] C8. D69, D51 and D68 where they no longer hold, the README keys and settings, the settings rule; a
  run of the real app under Xvfb (PC and Mac keyboard, dark and light, English and Portuguese).

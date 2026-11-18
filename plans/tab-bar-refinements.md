# Tab bar refinements: a compact update notice and middle click to close

Two small changes to the tab bar, both decided by the maintainer (2026-11-18).

Decided with the maintainer:

- When the window is narrow the update notice (D71) takes too much of the tab bar. Below a width
  threshold it becomes one icon button (a download arrow with a small dot, the rail icons' stroke, 17 px,
  `currentColor`); its full text goes in the design system's tooltip, and a click opens the tab bar's small
  menu with the same actions the full notice has in that state. The icon is focusable, Enter or Space opens
  the menu, Esc closes it and the focus returns to the icon. Restart stays a choice of the user.
- A middle click on a tab closes it at once, the same path as the menu's Close and the close key; when the
  middle button holds the hold menu (D69, `Mouse1`) it keeps that meaning.

## Tasks

- [x] T1. `notice.ts`: a lasting notice can bring a compact form; the notice measures the full form and
  shows the compact one while the full one would leave the tab strip less than three tabs at their widest
  (508 px). It follows the window's width; the Copied notice over the compact form shows over the end of
  the strip, out of the flow, so no tab moves. Tests.
- [x] T2. `update-notice.ts`: one description per state gives both forms (the text and buttons, and the
  icon with its tooltip and menu actions); a failure has its own glyph, a question a diamond, the work in
  progress no dot and no menu. Restart chosen from the menu with an agent running brings the menu back
  with Restart anyway and Cancel. Tests, both languages.
- [x] T3. `tab-bar.ts`: middle click closes, its press and release do nothing else (no focus move,
  autoscroll or paste of the primary selection on Linux); `holdsMiddleButton` in core keeps the hold
  menu's meaning. Tests.
- [x] T4. Decision D74, a check in the real app (several widths, both themes, both languages, tooltip,
  menu, keyboard, many tabs, Copied) and the gate.

## After review

- [x] T5. The copy over the compact form: the strip is masked to end where the full form would end it,
  so the copy reads as it does over the full form (same gap before it, to the pixel, and no tab text under
  or against it). Tests.
- [x] T6. `tab-menu.ts` takes an alignment (`end`: its right edge on the point) and an optional caption;
  `open` returns a handle that closes only that opening. The compact menu sits on its icon's right edge,
  6 px above the bar; the Restart anyway and Cancel menu says why in its caption; a new update state
  closes the compact menu. Tests.

The shortcuts page lists only keys the user can record and the tabs have no tooltip of their own, so the
middle click is not listed anywhere new.

# Personalization: appearance, terminal, and a settings file like VS Code's

A colleague's zsh prompt showed boxes in the terminal (its Powerline glyphs are not in the fonts the
cockpit asks for), some people prefer a bar cursor, and the maintainer wants the user to shape the cockpit
to their taste (2026-11-17).

Decided with the maintainer:

- The interface keeps Inter for text and JetBrains Mono for code (keys, branches, the diff), and both fonts
  ship with the cockpit (OFL), so it looks the same on every machine.
- The terminal's font is, by default, the one the user's own terminal uses (its profile's font; else the
  system's monospace font), shown by name so the user can tell and change it. The cockpit's font and the
  system's fill in any glyph the chosen font lacks.
- Everything lives in `settings.json`, edited by the settings screen or by hand like VS Code's: it applies
  as soon as it is saved, takes comments, has a button that opens it, and says which field it ignored.
- All in one delivery.

## Front A: fonts and the Appearance and Terminal groups (lead)

- [x] A1. Ship Inter and JetBrains Mono (woff2, OFL) with the interface; the tokens name them first.
- [x] A2. Port `SystemFonts` (the user's terminal font, the system's monospace font, the installed
  monospace families, the fonts that draw the prompt symbols) with a Linux implementation (GNOME
  Terminal and Ptyxis profiles, the GNOME interface setting, fontconfig) and plain fallbacks on macOS
  and Windows.
- [x] A3. Settings: `appearance.fontFamily`, `appearance.codeFontFamily` (null is the cockpit's),
  `terminal.fontFamily` (null is the system's), `terminal.cursorStyle` (block, bar, underline),
  `terminal.cursorBlink`; the terminal's size moves to the Terminal group on screen.
- [x] A4. The settings screen's Appearance and Terminal groups, with the system font named and the
  installed families offered; texts in both catalogs.
- [x] A5. The terminal applies font, fallbacks and cursor at once, to every tab, waiting for the font to
  load before it measures; the interface applies its fonts.
- [x] A6. Decision, README, screenshots in both themes and languages, a Powerline prompt drawn right.

## Front B: the settings file (delegated, branch `feat/settings-file`)

- [ ] B1. Comments and trailing commas in `settings.json`; the screen's writes keep the user's comments.
- [ ] B2. Any field saved by hand applies at once; the window's own writes do not loop; a file that is not
  valid JSON leaves the settings as they were and the screen says where it broke.
- [ ] B3. The screen lists the fields it ignored or clamped, with the value it found.
- [ ] B4. "Open the settings file" in the settings screen and the hold menu's System list.
- [ ] B5. Decision, README, a check in the real app.

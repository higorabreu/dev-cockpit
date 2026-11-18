# Mac keyboard: line editing, clear, last tab and the Option keys

On a Mac the terminal ignores keys a Mac user reaches for: in xterm 6 `⌘←` and `⌘→` send nothing, `⌘⌫`
sends a plain DEL, `⌥←` and `⌥→` send `CSI 1;3D` and `C` (zsh prints `;3D`) and `⌘K` does nothing. Option
as Meta (D51) also takes the accents and the `@` and brackets of international layouts away. The
maintainer settled the fix on 2026-11-18, after comparing VS Code (`sendSequence`), iTerm2 (Natural Text
Editing) and Ghostty. Recorded as D68.

Decided with the maintainer (Mac keyboard only unless stated):

- Line editing goes to the shell while the normal buffer is active; a full-screen program in the
  alternate buffer gets the raw key. `⌘←` `^A`, `⌘→` `^E`, `⌘⌫` `^U`, `⌥←` `ESC b`, `⌥→` `ESC f`,
  `⌥⌦` `ESC d`; `⌥⌫` stays `ESC DEL`.
- Clear the terminal, buffer and scrollback, like VS Code: `⌘K` on a Mac, `Ctrl+Shift+K` elsewhere, with
  an item in the hold menu.
- `⌘9` on a Mac and `Alt+9` elsewhere go to the last tab, like browsers and Ghostty.
- `macOptionClickForcesSelection`, so `⌥`+drag selects inside programs that use the mouse.
- The left Option is Meta and the right one types characters; a setting `terminal.macOptionAsMeta`
  (`left`, the default, `both`, `none`) shown only on a Mac keyboard.
- The right Command opens the hold menu by default on a Mac; a key the user chose is kept.
- The global key stays F12. On a Mac keyboard the recorded key shows with the Mac's symbols, and its row
  says the F keys need fn unless they are standard function keys.

Out of scope: the Ctrl+click and right click paste, a confirmation on `⌘Q`, the default global key.

## Tasks

- [x] T1. This plan.
- [x] T2. Line editing: a pure `lineEditSequence(event)` in `ui/src/terminal/line-editing.ts` with tests,
  wired in `terminal-session.ts` through `terminal.input` and only in the normal buffer.
- [x] T3. Clear: `clearTerminal` in both keymaps (`Ctrl+Shift+K` is free), the session's `clear()`, the
  action, a `tab:clear` item in the hold menu with the key, texts in both catalogs.
- [x] T4. Last tab: the digit 9 of `TAB` goes to the last tab on both keyboards.
- [x] T5. `macOptionClickForcesSelection: true`.
- [x] T6. Option keys: setting `terminal.macOptionAsMeta`, a tracker of the right Option in
  `ui/src/terminal/option-key.ts` with tests, the session flips `macOptionIsMeta` per key, the row in the
  Terminal group on a Mac keyboard only, applied at once on change.
- [x] T7. Hold menu key: `MetaRight` in `HOLD_TRIGGERS`, the Mac default in `HOLD_TRIGGER`, labels in
  both catalogs; offered only on a Mac keyboard.
- [x] T8. Global key on a Mac: the recorded accelerator in the Mac's symbols and the fn hint.
- [x] T9. D68, D51 where it no longer holds, the README keys, a run of the real app on Linux.

## Only a real Mac can confirm

- That Chromium on macOS reports `AltRight` and `MetaRight` for the right Option and the right Command,
  and that the right Option types `é`, `@` and `[` on the layouts that need it.
- That zsh and bash move and delete as expected with the sequences, and `⌥`+drag selects in vim or htop
  with the mouse on.
- That `⌘K`, `⌘9` and `⌘⌫` reach the window and no menu or system shortcut takes them first.

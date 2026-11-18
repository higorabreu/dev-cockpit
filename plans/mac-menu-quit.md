# Mac: a context menu in the terminal and a confirmation on ⌘Q

On a Mac a right click in the terminal pastes, the Linux habit: there a two-finger tap or Ctrl+click is
the context menu gesture, and pasting is a surprise. `⌘Q` quits at once, even with an agent or a server
running in a tab. The maintainer settled both on 2026-11-18. Recorded as D75.

Decided with the maintainer (Mac keyboard only unless stated):

- The secondary click in a terminal opens the small menu the tabs already use (`ui/src/tabs/tab-menu.ts`)
  at the pointer: Copy (disabled without a selection), Paste and Select all, each with its key (`⌘C`,
  `⌘V`, `⌘A`) as the hold menu shows keys. Arrows, Enter and Escape work, and the focus goes back to the
  terminal. Linux and Windows keep paste on right click.
- Ctrl+click is the Mac's secondary click, so it never opens a link or a path (they open with `⌘`+click)
  and never reaches xterm, which would clear the selection the menu copies.
- `⌘Q`, the app menu's Quit and the menu bar icon's Quit ask first when at least one tab runs a program
  other than its shell (an agent, a server, any foreground process); with only idle shells they quit at
  once. The question is an in-app card: "Quit Dev Cockpit?", one line with how many tabs run a program,
  Cancel focused (the destructive action is not the default on a Mac) and Quit; Escape cancels; `⌘Q`
  again while the card is open quits. Linux quits at once from the tray, as before.

## Tasks

- [x] T1. This plan.
- [x] T2. Menu items with a key: `MenuAction.key`, drawn as compact keycaps beside the label.
- [x] T3. The terminal's secondary click: on a Mac keyboard `attachClipboard` opens the menu instead of
  pasting and keeps Ctrl+click from xterm; xterm's `rightClickSelectsWord` off, since selecting copies.
  The session's `hasSelection`, `copySelection`, `pasteClipboard` and `selectAll`; the menu in `app.ts`
  with texts in both catalogs.
- [x] T4. The quit guard in `shell/src/quit/`: counts the terminals whose foreground is not idle with a
  fresh read, quits or asks the window; a second request while it asks quits; the window's answer comes
  back through `quit:answer`, validated. The bridge lists the terminals' pids.
- [x] T5. The card in `ui/src/quit/quit-card.ts` with its style, texts in both catalogs, Escape, Tab kept
  inside, the cockpit's keys quiet while it is open.
- [x] T6. Wired in `main.ts`: the Mac's app menu and menu bar icon go through the guard
  (`platform.asksBeforeQuit`), Linux keeps quitting at once.
- [x] T7. D75, screenshots on Linux with the window reloaded as a Mac keyboard.

## Only a real Mac can confirm

- That a two-finger tap and Ctrl+click fire `contextmenu` in the terminal, and Ctrl+click's `mousedown`
  arrives with `button` 0 and `ctrlKey`, as Chromium documents.
- That `⌘Q` reaches the app menu while the card has the focus, so the second press quits.
- That `⌘C`, `⌘V` and `⌘A` from the Edit menu and xterm do what the menu's items do.

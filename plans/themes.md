# Themes

**Status:** In progress (phase 1).

## Goal

The user picks the cockpit's colors from a short list of built-in themes, makes a theme of their own from
any of them, and changes single colors from `settings.json`, the way VS Code does with color themes,
`workbench.colorCustomizations` and `editor.tokenColorCustomizations`. A theme colors the whole cockpit at
once: the interface, every terminal and the file editor, live, with no restart. dck's own Dark and Light
stay the default and nothing changes for a user who never opens the theme picker.

Agreed with the maintainer on 2026-11-24.

## Phases

1. **This delivery:** theme files (built-in and the user's), the picker per mode in Settings, "New theme
   from this one", single-color overrides in `settings.json`, live apply, contrast warnings.
2. **Later, not built now:** importing a VS Code theme file (`.json` with `colors` and `tokenColors`),
   mapping its scopes onto the syntax roles and its workbench colors onto the cockpit's tokens.

## Decisions

- **A theme is one variant.** A file holds one `type`, `dark` or `light`. A family with both (dck, GitHub)
  ships two variants with the same name; the picker for each mode lists the themes of that type, so the
  names carry no "Dark" or "Light" word (`"GitHub"` in both pickers). A theme is known by its name and
  type; names are not translated, as a font family is not.
- **File format** (JSON with comments, read through the `SettingsText` port like `settings.json`):

  ```jsonc
  {
    "name": "Dusk",
    "type": "dark",
    // Any cockpit color token of tokens.json `themes.<type>.color`
    "colors": { "bg": "#101418", "accent": "#7aa2f7" },
    // The sixteen ANSI colors
    "terminal": { "red": "#f7768e", "brightBlack": "#8089b3" },
    // The syntax roles of tokens.json `themes.<type>.syntax`
    "syntax": { "comment": "#8a93b8", "string": "#9ece6a" }
  }
  ```

  Anything left out comes from dck's own Dark or Light, by `type`. Values are `#rrggbb`. The terminal draws
  on the window's own color (`colors.bg`, which the opacity setting needs) with `colors.fg` as its text and
  cursor, and its selection is derived from them as today, so the terminal section holds only the sixteen
  ANSI colors: a separate terminal background, foreground, cursor or selection would break the opacity and
  the contrast pairs that depend on them. The scrollbar overlays follow the type.
- **Validation** (zod, `core/src/themes/theme-file.ts`): an unknown key, a value that is not a hex color or
  a bad `type` falls back and is listed as a warning, as `settings.json` issues are. A missing name takes the
  file's name. A file that is not valid JSON with comments keeps the last good version in use and says where
  it broke. Two user themes with one name and type, or a user theme with a built-in's name and type: the
  later file (by file name) is left out and says so.
- **Settings:** `theme` stays the mode (`dark`, `light`, `system`; `Ctrl+Shift+L` toggles dark and light).
  New: `colorTheme: { "dark": "dck", "light": "dck" }`, the theme each mode uses (VS Code's preferred dark
  and light themes), and `colorCustomizations: { "colors": {}, "terminal": {}, "syntax": {} }`, single
  colors applied over whichever theme is active, both modes. A name that matches no theme uses dck and the
  picker says so. Per-theme override blocks (`"[Dracula]": {...}`) are left for later.
- **Where things run:** the host reads `themes/` beside `settings.json` (`shell/src/themes/`), validates each
  file and sends the list to the window, watching the folder as it watches the settings file. The window
  holds the built-in themes (`packages/design/themes/`, bundled), resolves the active one over dck's base
  and applies it: CSS variables on the root, the xterm theme of every terminal, and CodeMirror through the
  same variables. Nothing is read for themes but that folder, once on start and on a change.
- **Creating and editing:** Settings has "New theme from this one": the host writes the current theme,
  complete (every token, so the file shows everything there is to change), as a new file in `themes/`
  named after it (`<name> copy`), and the window opens it in a tab of its own, saved only on Ctrl+S, the
  way `settings.json` opens (D91; the opener is generalized). A user theme in use also offers "Open the
  theme file". Saving applies at once; a broken save keeps the last good colors.
- **Contrast:** every built-in theme, dark and light, passes the existing checks (`contrast.ts`, WCAG AA
  4.5:1 for text on every ground the editor and the terminal draw on, 3:1 for graphics; tested). A user
  theme or an override is applied anyway; Settings shows a quiet note under the mode's picker listing the
  pairs below the minimum by their token names (`syntax.comment on colors.searchCurrent 3.2:1`), which is
  what the user edits. Each check now names its two colors as token references for this.
- **Built-in themes:** dck (the default, both types), the editor palettes explored on 2026-11-19 over
  dck's interface (Grafite, Sálvia, Terra, Estrutura, Sinal, dck vivo; both types; their colors from the
  mock pages, moved the least needed to pass the checks on every editor ground, the bold and italic of the
  mocks left out since a role is a color), and three of the most installed VS Code color themes, all MIT:
  - **GitHub** (GitHub's VS Code theme, `primer/github-vscode-theme`, MIT): the most installed color theme
    on the Marketplace, and it has an official dark and light (Dark Default and Light Default).
  - **One Dark Pro** (`Binaryify/OneDark-Pro`, MIT): for years the most installed theme, dark only.
  - **Dracula** (`dracula/visual-studio-code`, MIT): among the three most installed, dark only, with a
    published palette spec.
  Picked over Tokyo Night and Catppuccin, also MIT, by installs, and because two dark-only ones and one
  with both types keep the list short. Their colors are mapped onto the cockpit's tokens and adjusted only
  where a pair failed the checks (listed in `packages/design/themes/NOTICE.md` with their licenses).
- **Performance:** no cost at idle; on start one folder read beside the settings, in parallel with the
  window's creation; one more `fs.watch`. Switching applies with no animation beyond what exists.

## Acceptance criteria

1. Every built-in theme passes every contrast check (test in `packages/design`).
2. A theme file with unknown keys, bad values or a bad type is used with dck's values in their place and
   each is listed (core test); a broken file keeps its last good version (shell test).
3. `colorTheme` and `colorCustomizations` validate like any setting: a bad entry is dropped and listed
   (core test).
4. The resolved theme is dck's base, then the theme, then the overrides (test).
5. Picking a theme, saving a theme file or saving an override in `settings.json` recolors the interface,
   every open terminal and the editor at once (checked in the real app, screenshots).
6. "New theme from this one" writes a complete copy in `themes/` with a free name and opens it in a tab of
   its own that saves only on Ctrl+S (tests for the store and for the auto save rule; real app).
7. A user theme below AA shows which pairs fail under its picker, and is applied anyway (test and real
   app).
8. Interface text in both catalogs (catalog test).

## Tasks

- [ ] T1. design: name each contrast check's two colors; build the root variables and the terminal theme
  from any resolved theme; resolve a theme over the base; built-in themes with their NOTICE; tests.
- [ ] T2. core: theme keys, theme file schema with issues, `colorTheme` and `colorCustomizations`
  settings, `themes` in the host API and its channels; tests.
- [ ] T3. shell: theme store (read, keep the last good, create a copy with a free name) and the folder
  watch; host bridge and preload; tests.
- [ ] T4. ui: theme catalog and live apply (CSS variables, terminals, editor) wired in the app and on start.
- [ ] T5. ui: Settings pickers per mode, "New theme from this one", "Open the theme file", the contrast
  and file notes; both catalogs; the own-file tab generalized and theme files saved only on Ctrl+S.
- [ ] T6. docs: D92, this plan, roadmap if it lists themes.
- [ ] T7. Real app QA: every built-in theme with a colored terminal and a TypeScript file, the Settings
  section, the new theme flow, a live edit, a live override, a contrast warning
  (`plans/local/qa/themes/`).

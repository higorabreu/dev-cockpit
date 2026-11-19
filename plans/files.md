# Open and edit files in the cockpit

**Status:** Agreed with the maintainer on 2026-11-19; the syntax colors decided by F0. F0 to F3 done, F4 in
progress (F4a: the file over the tab and the editor, D83).

Asked by the maintainer on 2026-11-17 (roadmap backlog, "Editing files") and refined on 2026-11-19: find a
file of the tab's project and open it in the cockpit, text and code to edit, and the common non-text files
to look at, without leaving the terminal's window. The next features are expected to weigh more than what
shipped so far, so every part is measured against the baseline (`plans/performance.md`, `scripts/perf/`)
before it is kept.

## Decided with the maintainer

- **Where:** a file opens over the whole tab (its terminal and its review stay underneath, alive), as an
  appendix of the tab: the tab grows a second segment with the file's name, `api │ login.ts`, set off by a
  1px divider, the active segment in the selected tab's style. A click on either segment, or one toggle
  key, `Ctrl+Shift+Space` (to confirm on the Mac), switches between the terminal (with its review) and the
  file; going back never closes the file.
  An inactive tab with a file shows only a file glyph, as the review's split glyph (D47). A hollow ring marks
  edits not yet saved, every time, even for the second auto save waits (the maintainer's choice; a filled
  dot already means "something finished" on a tab), and a filled dot in the warning color a conflict
  with the disk (the maintainer's choice over a triangle; inside the file's segment the shapes tell them
  apart, ring for unsaved, filled dot for conflict, and the tooltip names it); an inactive tab with a file
  shows the same marks beside its glyph; nothing once saved. In a narrow window the name shrinks with an
  ellipsis, then leaves only the glyph. The segment's right click menu holds Recent and Close file, the
  hold menu's Tabs list and the tab's right click menu get "Show file" / "Show terminal", and the file
  view's header has a terminal button with the key in its tooltip. Precedents: Wave's magnified block over
  the tab, D47's glyph in the tab (research, 2026-11-19). One file at a time per tab, with a list of
  recent files to switch quickly; no tabs inside the file view.
- **How a file is reached, first version:**
  - A file search of its own: the files of the tab's project by name, as VS Code's quick open does,
    ranking the project's files first (see "Ignored files" below), on `Ctrl+Shift+O` (`⌘P` on the Mac);
    the project search stays on `Ctrl+Shift+P`. Ctrl+P stays with the shell (D13): bash, zsh, fish and the REPLs read it as the previous
    line, vim as completion, htop, fzf, less and Claude Code's lists as up. VS Code and Zed take it from
    the terminal, Warp and JetBrains leave it; Ctrl+Shift+O is Warp's file search on Linux. The Shortcuts
    page offers Ctrl+P in one click, with D69's note that the terminal no longer gets it. A Ctrl+P that
    changes meaning with the program on screen was left out: unpredictable, and a bash prompt would lose
    it anyway. Ctrl+Shift+F stays free for a later search in files or in the terminal.
  - Ctrl+click on a file path in the terminal opens it in the cockpit (D40 opens it in the system's app
    today); a folder still opens in the file manager.
  - From the review: a button on a file opens the whole file at the line in view.
  - A folder tree is left for later.
- **Saving:** automatic by default, as an option the user can turn off (`files.autoSave`, on by default,
  as VS Code's `files.autoSave`): a pause in typing (about 1 s), leaving the file, switching to the
  terminal, hiding the window or closing the tab saves, always through the change check below. Turned off,
  closing the tab or opening another file with edits asks: save, discard or cancel.
- **Kinds:** text and code to edit. Images, Markdown with a preview and PDF to look at, each kept only if
  its cost is acceptable (below); anything else, or a file over the limit, shows a card with its kind and
  size and "Open in the system's app".

## Details agreed

- **Syntax colors in any language** (asked by the maintainer): code reads as in VS Code, whatever the
  language. Two ways, to weigh in F0:
  - CodeMirror's own grammars (Lezer) for the common languages (JavaScript and TypeScript, JSX, Python,
    Go, Rust, Java, C and C++, PHP, HTML, CSS, JSON, YAML, Markdown, SQL, XML, shell), plus its legacy
    modes for about a hundred more at a lower fidelity, each loaded on first use. Incremental, so typing
    stays fast in large files; the colors are close to VS Code's but not identical.
  - TextMate grammars, the ones VS Code uses, through Shiki (an Oniguruma WebAssembly engine, about 200
    languages, grammars loaded per language). The same colors as VS Code, but it highlights a whole
    document rather than incrementally, so it suits reading (the review's diff, a preview) more than
    typing in a large file.
  Either way the colors come from the cockpit's tokens: a syntax palette for each theme in
  `packages/design/tokens.json`, checked for contrast like the rest. The review's diff, which has no syntax
  colors today (D47), can use the same highlighter afterwards.
- **Search inside the file** (asked by the maintainer): while the file shows, the keys belong to the editor,
  not to the shell, so the editor's usual keys apply: `Ctrl+F` find (`⌘F`), `Enter` and `Shift+Enter` or
  `F3` next and previous, `Ctrl+H` replace (`⌥⌘F`), `Ctrl+G` go to line, with match case, whole word and
  regular expression toggles and the count of matches. CodeMirror's own search (`@codemirror/search`)
  does it in a small bar at the top of the file, drawn with the cockpit's tokens; its cost is part of F0.
  A selection opens the search with the selected text. Esc closes the bar and stays in the file. The
  same search on images and PDF is not offered; Markdown searches its text in the editor, and the
  preview uses the page's find if PDF or the preview need it later.
- **Editor:** CodeMirror 6, loaded on the first file opened (a dynamic import), with the language packs
  loaded per language. Monaco is left out: tens of MB against the 300 MB idle budget. It reads
  `.editorconfig` for the indentation and the final newline. Its cursor blinks with the terminal's timer
  (D58), not with CodeMirror's CSS animation, which cost a frame per echo in the terminal. The baseline
  (`plans/performance.md`) leaves about 36 MB of the 300 MB idle budget, so nothing of the editor loads
  until a file opens.
- **Look approved** (2026-11-19, from screenshots of a prototype over the real tab bar).
- **Merging by itself, on by default** (the maintainer, 2026-11-19; `files.autoMerge`, can be turned off):
  when the disk changes while the user has edits, a line based three-way merge (diff3, as `git merge-file`)
  of the base read last, the editor's text and the disk's. Changes in different places merge: only the
  disk's hunks are applied to the editor, so the cursor, the selection and the user's typing stay; the
  merge is kept out of the user's undo history (Ctrl+Z undoes only what the user did); the base becomes the
  disk's text and auto save writes the result. A quiet strip says "Merged with a change on disk · Show ·
  Undo merge": Show marks the lines that came from the disk, Undo merge restores the user's text and opens
  the conflict strip. No merge, and the conflict (yellow dot) instead, when the changes touch the same or
  adjacent lines (as git), when the disk changed more than about 30% of the lines (a formatter), when the
  line endings or the encoding changed, or when the file was deleted or is no longer text. Compare then
  shows the three versions to pick hunk by hunk. The risk left is git's own: two changes right apart and
  wrong together; the strip says a merge happened and the review shows it. The library is small (about
  10 KB) and runs only when the disk changes. Where the merge runs (the window, since `core` takes no
  package) is decided in F1.
- **An agent changing the same file:** the open file is watched. Changed on disk with no edits of yours, it
  reloads in place and keeps the scroll; with edits of yours, a strip offers Reload, Keep mine or Compare.
  Saving checks that the file did not change since it was read (size, mtime and a hash) and writes to a
  temporary name and renames, so an agent never reads half a file.
- **Limits:** text over 5 MB opens read only; over 50 MB, or binary, only the card.
- **Access:** the host reads and writes through a port and an adapter (`node-fs`), validated with zod at the
  bridge; it saves only to the path that was opened. Non-text files reach the page through a custom
  protocol that serves only a path the user opened, never a remote URL.
- **Budgets of its own** (checked by the perf script): nothing added to idle memory while no file was ever
  opened; opening a 1 MB file in under 150 ms; key to echo in the editor within 16 ms; the memory added by
  an open file, per kind, reported.

## Cost of each kind, to measure before keeping it

| Kind | Candidate | What may cost | Measure |
| --- | --- | --- | --- |
| Text and code | CodeMirror 6, lazy, language packs per language | bundle size, heap after open, key echo | open 10 KB, 1 MB, 5 MB; echo; heap |
| Syntax colors | Lezer grammars, or Shiki (TextMate) | grammar size per language; WebAssembly engine for Shiki; time to color a large file and to recolor on a key | both on 1 MB TypeScript and Python files: first paint, key echo, heap |
| Images | `<img>` through the protocol | decoded size in memory (a 4000x3000 PNG is about 48 MB) | heap and process memory with large images; cap the decoded size |
| Markdown | a parser and a sanitizer (markdown-it or marked, DOMPurify), lazy | small bundle; render time on long files | render of a 1 MB README; no remote images by default |
| PDF | Chromium's own viewer (`plugins: true`) or pdf.js, lazy | an extra process or a large worker | memory and start time of each with a 50-page PDF; pick one or drop PDF |

## Open questions

- None left from F0: the syntax colors are Lezer's, in the palette the maintainer chose (D83).

## Tasks

- [x] F0. Spike: measure each kind of the table with the perf script; decide which kinds stay. Decided on
  2026-11-19 from [files-measurements.md](files-measurements.md): CodeMirror 6 loaded on the first open,
  its cursor blinking with the terminal's timer; syntax colors with Lezer's grammars through
  `@codemirror/language-data`, each language on first use, up to 2 MB, editable without colors from 2 to 5
  MB, read only to 50 MB and the card above; images, Markdown (marked and DOMPurify) and PDF (Chromium's
  viewer) kept for F4b.
- [x] F1. Core: file opening model (kinds, limits, recent list per tab), the conflict rule, tests (D81).
- [x] F2. Adapter and bridge: read, watch, atomic save with the change check, the protocol for non-text
  (D81).
- [x] F3. File search: the project's files (`git ls-files`, else a bounded walk), fuzzy match, the ignored
  group and the step into an ignored folder, key.
- [ ] F4. File view over the tab: editor, image, Markdown, PDF, card; switch key; recent list. In progress:
  - [x] F4a (D83). The appendix in the tab bar with its marks and menus, `Ctrl+Shift+Space` (`⇧⌘Space`),
    the editor (CodeMirror, Lezer colors, the palette in `tokens.json`, `.editorconfig`, line endings kept,
    timer blink), the search inside the file, auto save, the strips for a merge, a conflict (Compare as two
    read only columns) and a deletion, the recent list kept with the tab, the card for every other kind,
    and the file search's pick opening here.
  - [ ] F4b. Image, Markdown preview and PDF views in place of the card (`load` in
    `ui/src/files/file-tabs.ts` is the seam); the three-way Compare that picks hunk by hunk.
- [ ] F5. Entries: Ctrl+click on a path (amends D40), the review's button.
- [ ] F6. Decision (and D13's text, which still names Ctrl+Shift+O for projects), README, perf report updated, checks in the real app with screenshots, both themes.

## Why a toggle key and not Esc

Esc cannot leave the file: the editor uses it (close its search, drop extra cursors, leave a completion, a
Vim mode later); the review can give the keys back with Esc only because it has no text field. Ctrl alone
belongs to the shell and to Claude Code (D13), and Ctrl+\` (VS Code's habit) is a dead key on the Brazilian
ABNT2 layout. The project's pattern is one key that shows and hides a view of the tab (Ctrl+Shift+D for the
review), with the hold menu and the tab's right click carrying the same action. With auto save on, going to
the terminal saves first, so the agent and the shell see the file as typed.

## Ignored files in the file search (agreed, 2026-11-19)

Any file opens and saves, ignored by git or not (Ctrl+click on a path opens anything). Only the search
treats ignored files apart, so `node_modules` and builds never crowd it, while a `.env` is one word away.
The maintainer's idea: ignored files show only when what is typed finds them.

**How others do it** (2026-11-19). VS Code's quick open lists files with ripgrep and leaves gitignored
files out by default (`search.useIgnoreFiles`); a file already open or in its history still shows. Zed does
not walk ignored folders, shows ignored files it already knows (opened from its panel), has a "smart"
default and a toggle in the finder (`ToggleIncludeIgnored`). JetBrains does not index excluded folders;
pressing Go to File a second time ticks "Include non-project items", and with no match in the project it
widens the search by itself. Taken from them: ignored folders are never walked unasked (all three); a file
the user opened stays findable through the recent list (VS Code, Zed); the same key pressed again widens the
search (JetBrains), and so does an empty project result (JetBrains).

**What can go wrong, and the answer to each.**
- *Listing every ignored file is slow*: `node_modules`, `target` or `.venv` can hold hundreds of thousands
  of files. The list comes from `git ls-files --others --ignored --exclude-standard --directory`, which
  names a wholly ignored folder once (`node_modules/`) instead of walking it. Shallow ignored files
  (`.env`, `config.local.json`, `notes.txt`) come one by one; wholly ignored folders stay closed.
- *Fuzzy matching drowns the list*: "env" as a scattered subsequence matches hundreds of paths. Ignored
  files match a stricter rule than the project's: the query, three characters or more, must appear whole
  in the file's name (case ignored unless the query has a capital, a leading dot ignored, so "env" finds
  `.env` and `.env.local`), never scattered across the path.
- *They push the project's files down*: they never mix in. They come after the project's results, in a
  group headed "Ignored by git", at most 5 rows with "N more" when there are more; with an empty query the
  group does not exist.
- *Wanting more than the strict rule finds*: pressing `Ctrl+Shift+O` again with the search open widens it to
  every ignored file it can list (the same bounds, closed folders still closed) and says so in the header;
  and when the project has no match at all, the ignored group shows with the looser fuzzy rule by itself.
- *Reaching inside an ignored folder*: typing a path that goes into one (`node_modules/react/`, `dist/`)
  lists that folder alone, on demand, bounded (two levels per step, 2000 entries, 300 ms), without
  following symbolic links; the closed folder itself shows in the group as a row to step into.
- *Git rules are many*: nested `.gitignore` files, `.git/info/exclude` and the global `core.excludesFile`
  all count, because git applies them; the cockpit does not parse `.gitignore` itself.
- *No repository*: a bounded walk (20 000 entries, 2 s) skipping the usual generated folders
  (`node_modules`, `.git`, `dist`, `build`, `target`, `.venv`, `__pycache__`), shown as one list.
- *Secrets*: a `.env` opens and saves like any file, but the search shows names only, never content, and
  no file's content goes to a log, an index or a cache. The recent list keeps paths only.
- *Editing a generated file by mistake*: the file view's header says "Ignored by git" beside the path, so
  an edit to something a build or an install will overwrite is a visible choice.
- *Large or binary ignored files* (logs, databases): the size and kind limits apply as to any file.
- *Submodules*: their tracked files are listed (`--recurse-submodules`); their ignored files are left out of
  the first version.
- *Freshness*: the lists are read when the search opens and filtered as you type; a repository so large
  that listing takes more than about 200 ms is filtered off the main thread. Measured in F0 on a small
  repository, this one, and a large public one (about 100 000 files, with a full `node_modules`): time to
  list (tracked, ignored with folders closed), memory of the list, time per key to rank, all against
  ripgrep's `rg --files` as the reference VS Code uses.

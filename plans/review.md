# Review: what the agent changed

## Goal

The developer reads what an agent changed without leaving the cockpit: next to the terminal where the
agent works, in the same tab. The agent says "your turn" or "needs you" (D37); the developer presses
Ctrl+Shift+D (reserved in D13) and reads the diff beside it. Read only in phase 1; comments sent back to
the agent come in phase 2.

## Decisions taken with the maintainer (2026-11-13)

- **Where:** Ctrl+Shift+D splits the current tab: the terminal on the left, the review on the right; the
  same key closes it. Both stay visible. This is the first step of a pane layout (split in 2, 4 or 6 and
  move tabs come in a later phase), so the split is built as a small, general pane model, not as a
  special case of the review.
- **What:** opens on the uncommitted changes of the tab's repository; a select switches to the whole
  branch against its base (what the merge request will contain).
- **How it reads:** a file list and one unified diff, the way GitHub and GitLab present it, with no
  language detection and no syntax colours: old and new line numbers, added and removed lines on green and
  red backgrounds, the changed words inside a line on a stronger background, the hunk header with the
  function or class Git reports, and unchanged lines collapsed with "Show N lines". It works the same for
  every language. Syntax colours were measured (Shiki: 11 MB of grammars, +79 MB while open, 0.56 s for a
  700-line file; highlight.js: about 20 KB per language, +26 MB, 0.04 s) and left out until using the
  review shows they are missed.
- **Comments:** phase 2.

## Principles

- **Next to the work.** The review belongs to the tab: it follows the tab's folder and agent.
- **Read only.** No stage, discard or commit in this plan; those are writes the developer does in the
  terminal or the agent does.
- **Any language, any repository.** Binary files, very large or generated files, renames, permission
  changes, submodules, CRLF and non-UTF-8 files are shown for what they are instead of breaking the view.
- **Light.** Nothing runs while the review is closed; the diff is read on open, on Ctrl+R and when the
  tab's agent changes state.

## Phase 1: the split and the read-only review

- **Panes.** A tab holds one or two panes side by side with a draggable divider (and a keyboard way to
  resize); the second pane is the review. Below a minimum width the review takes the whole tab, with the
  terminal one key away. The model is general enough that a second terminal pane can be added later
  without rewriting it.
- **Diff source.** A port in `core` (`DiffSource`) with the git adapter in `node-git`: `git diff` with
  fixed arguments (no shell), `--no-color --no-ext-diff -M` and the scope's range, untracked files as
  additions; the unified diff is parsed in `core` (pure, tested) into files, hunks and lines. The base of a
  branch was first the merge base with the remote's default branch; phase 1b replaced it (below).
- **Word changes.** Pairs of removed and added lines inside a hunk are compared word by word, so only the
  changed part is marked; language independent. The comparison uses `diff` (jsdiff, no dependencies, the
  library diff2html itself builds on), in `ui` because `core` imports no package; only the word function
  is bundled.
- **Libraries considered.** diff2html renders whole files as HTML from its own templates, with no
  virtualization and its own look, so it would fight the design system and the 10 000-line budget;
  `@git-diff-view/core` pulls highlight.js. The unified diff parser is small and needs the edge cases
  below, so it stays in `core`, pure and tested.
- **Edge cases.** Binary files show their size; a file over a size or line limit and generated files
  (lock files, `dist/`, minified files, `linguist-generated` in `.gitattributes`) start collapsed with
  "Show anyway"; non-UTF-8 text is treated as binary; renames and mode changes are labelled; a hide
  whitespace toggle (`-w`).
- **Navigation.** Keyboard first: the file list with ↑↓, Enter to its diff, next and previous file and
  hunk keys, Ctrl+R to refresh, Esc back to the terminal; Ctrl+click on a file path opens it (D40).
  Virtualized lines, so a 10 000-line diff scrolls at 60 fps.
- **States.** Not a Git repository, no changes, a failed `git`, and loading, each with its own text.

## Phase 1b: layout that fits the window, and one continuous diff

Decided with the maintainer after using phase 1 (2026-11-13): beside the terminal, the review squeezed both
sides at a usual window size (a 1400px window leaves about 680px each: the terminal wraps the agent's
output and the diff cuts long lines), and reading one file at a time broke the flow of reviewing a whole
change.

- **Orientation by the tab's shape.** Side by side when each side keeps about 100 columns; stacked, the
  terminal on top and the review below, when it does not and each side keeps at least 15 rows; the review
  takes the whole tab, as today, when neither fits.
- **The user's choice wins.** A control in the review header and a shortcut switch between side by side and
  stacked; the choice and the divider's ratio are kept in settings (`review.layout`: auto, side, stacked)
  with a row in Settings, and the divider drags in both orientations.
- **One continuous diff.** Every file in one virtualized scroll, each with its header, the way GitHub shows a
  change; the file list becomes an index that scrolls the diff to a file, collapsible, beside the diff
  when the review is wide (always in the stacked layout); `n` and `p` cross files, `[` and `]` jump to the
  previous and next file.

- **The base of the Branch scope** (decided with the maintainer, like VS Code): the branch the current one
  was created from, not the remote's default. In order: `branch.<name>.vscode-merge-base` when it resolves;
  the branch's own reflog ("branch: Created from <ref>", and for "Created from HEAD" the HEAD reflog's first
  "checkout: moving from <ref> to <name>"), skipping commits, the branch's own remote copy and refs that no
  longer resolve, the local branch before `origin/`; else the nearest branch. No branch name is special
  (the maintainer, 2026-11-14: every team has its own, trunk, dev, staging, release/*): the candidates are
  the 30 most recently committed local and `origin/` branches (`for-each-ref --sort=-committerdate`), each
  name once with the local copy first, without the current branch, its remote copy, its upstream,
  `origin/HEAD` and any branch that already contains HEAD (its merge base with HEAD is HEAD); the nearest
  has the fewest commits ahead, then the latest merge base. They are measured 4 at a time and kept per
  HEAD and refs. On the remote's default branch (`origin/HEAD`) the nearest is only the latest fork, so
  nothing is found there unless the user picks a base. The user can pick another from the scope select,
  kept per repository folder in settings (`review.bases`). The select always offers three scopes:
  "Uncommitted"; "Base: <name>" with how it was found in its tooltip and the other candidates, nearest
  first, after the three, disabled with the reason when no base is found; "Unpushed commits" (the merge
  base with HEAD's upstream to the working tree), disabled with the reason when there is no upstream.

| Id | Criterion | Verification |
| --- | --- | --- |
| R9 | At 1400x760 the review opens stacked with the terminal on top; at full height on a 1920px screen it opens side by side; below both, it takes the tab | Tests with sizes, screenshots |
| R10 | The orientation control, its shortcut and the Settings row switch the layout at once and the choice survives a restart; the ratio is kept per orientation | Tests, a real-app run |
| R11 | All files read as one scroll; the index scrolls to a file and follows the scroll; a 10 000-line change still opens under 300 ms and scrolls at 60 fps | Tests, measured |

- [x] RV-T7. `core`: the orientation rule from the tab's size and the setting; the pane model gains an
  orientation and a ratio per orientation. (R9, R10) The rule takes each pane's grid (the terminal's real
  cell size and padding, the diff's 12px cell and gutters): side by side when each keeps 100 columns, else
  stacked when each keeps 15 rows (and the review its 440px width), else the focused pane alone.
- [x] RV-T8. Settings `review.layout` with its row, the header control and shortcut, the stacked layout and
  the divider in both orientations. (R9, R10) The shortcut is Ctrl+Shift+E (free in D13 and in Claude Code,
  Terminator's and Guake's split key); the button names the orientation it switches to. Shares are saved
  400 ms after the divider rests.
- [x] RV-T9. The continuous diff and the file index. (R11) Each file's rows sit in a `group` named after the
  file inside the diff's listbox, its header row first (an option the cursor lands on with `]` and `[`); the
  header of the file being read is pinned on top. A collapsed or binary file is its header alone, with
  "Show anyway" (Enter on the header). The index sits beside the diff from 720px of review width.

From a usability test of phase 1 (2026-11-13), done in 1b, each with a test:

- [x] The keys fell to the page when `]`, `[` or `n` landed on a collapsed or binary file; in one scroll the
  cursor lands on the file's header, focus stays on the diff and a redraw that hides the focused part gives
  the keys back to the review.
- [x] Ctrl+Shift+D from the terminal gives the keys to an open review, and closes it only from the review; a
  reopened review keeps its file and line.
- [x] The divider's share survives a restart (settings, checked with a real restart).
- [x] The hint bar follows the focus: the review's keys while it has them, else Ctrl+Shift+D.
- [x] `p` crosses files like `n`.
- [x] The line numbers, the sign, hunk headers and gap rows stay in view on a sideways scroll.
- [x] The file header that repeated the selected row, and opening on a two-line deleted file, are gone with
  the continuous diff.

Measured under Xvfb at 1400x760 and 1920x1040: Ctrl+Shift+D to the index 130-210 ms; "Show anyway" on a
10 000-line file to the painted rows 24-26 ms; 239 scrolled frames at a 16.7 ms median, none dropped, with
41 rows in the page (73 at full height).

## Phase 1c: a review that keeps up with the agent

Asked by the maintainer after using 1b (2026-11-17): the agent keeps changing files while the developer reads,
and a long change has no memory of where the reading stopped.

- **It follows the working tree.** While the review is open and the window shown, it checks every 2 s
  whether the change moved, with a fingerprint that costs one `git status` instead of a whole diff: the
  porcelain status with HEAD, plus the size and modification time of each changed path. Only a different
  fingerprint reads the diff again. When `git status` itself takes over 300 ms (a huge repository), the
  interval doubles up to 16 s. Nothing runs while the review is closed or the window hidden. Ctrl+R and the
  agent's state change stay as they are.
- **A refresh never moves the reader.** The line under the cursor, the scroll, the opened gaps and the
  collapsed or viewed files stay where they were; when the file at the cursor is gone, the cursor goes to
  the next file. A background refresh shows no loading text.
- **Viewed, as on GitHub.** Each file header has a "Viewed" checkbox, and `v` toggles it for the file at the
  cursor. A viewed file folds to its header, and marking it moves the cursor to the next file not yet
  viewed. The index marks viewed files with a check, and the header counts "3 / 12 viewed". The mark
  belongs to the file's patch: when the agent changes that file again, the mark goes away and the header
  says "Changed since last viewed". The marks live with the tab and do not survive a restart, until using it
  shows they should.
- **The state as a letter, as in VS Code.** M, A, D, R, C and U (untracked) replace the glyph, in the file
  index and in each file header, in the state's color, with the full name in the tooltip and for screen
  readers.

| Id | Criterion | Verification |
| --- | --- | --- |
| R12 | A file the agent changes while the review is open shows up within 3 s, with the cursor, scroll and opened gaps where they were | Tests with a fake clock, a real-app run |
| R13 | Closed or with the window hidden, the review runs no `git`; open and idle on this repository it costs under 1% of a core | Tests, measured |
| R14 | `v` and the checkbox mark a file viewed, fold it and move to the next unviewed one; the count follows; a later change to that file clears the mark and says so | Tests |
| R15 | Every state has its letter in both places, in both themes, with 3:1 contrast and the name in the tooltip and the accessible name | Tests, contrast check, screenshots |

- [x] RV-T10. `core`: the change fingerprint and the patch key of a file (a small hash of its hunks), pure
  and tested; the `DiffSource` port and the `node-git` adapter answer the fingerprint. (R12, R14)
- [x] RV-T11. Host API and refresh: the fingerprint channel, the 2 s check with its back-off, paused when
  closed or hidden, and a refresh that keeps the reader's place. (R12, R13)
- [x] RV-T12. Viewed: the checkbox, `v`, the fold, the jump to the next unviewed file, the index check, the
  count and "Changed since last viewed", in both catalogs. (R14)
- [x] RV-T13. Status letters in the index and the headers, tokens and contrast checks, screenshots in both
  themes and languages. (R15)
- [x] RV-T14. Docs: the README's key table (`v`), a decision record, the roadmap.

## Phase 2: comments back to the agent

The developer reads the change, leaves comments on lines as in a GitHub review, and hands them all to the
agent in the tab at once: typed at the terminal's prompt, without Enter, so the developer can add a word
and send it, whatever agent (or shell) is listening.

Decided with the maintainer (2026-11-17):

- **Selection, as on GitHub.** A click on a line selects it and Shift+click on another selects the range;
  from the keyboard Shift+↑↓ extends the selection from the cursor. `c` opens a comment field for the
  selected lines, or the cursor's line when nothing is selected. The mouse path is a small "+" on the
  gutter of the line under the pointer, with `c` in its tooltip.
- **Batched like a GitHub review.** Comments stay pending in the diff, under their lines, editable and
  deletable. "Send to agent" in the review header, with the count, types all of them into the tab's
  terminal prompt without pressing Enter, then clears them. Esc in the field cancels; Ctrl+Enter saves.
- **One line per comment**, `path:lines: comment`, the code quoted below when it is short, typed with the
  terminal's paste so a TUI reads it as one block (bracketed paste). Nothing assumes Claude Code.
- **Pending comments belong to the tab's review**, follow their lines across refreshes and turn outdated
  when the lines are gone, as GitHub says "Outdated". They do not survive a restart.

Rules decided here:

- **What can be commented.** The lines of the change: added, removed and the unchanged lines Git shows
  around them in a hunk. A range stays inside one hunk: Shift+click or Shift+↑↓ past its edge stops at the
  edge. Lines opened from a collapsed gap read but take no comment, as on GitHub, since they are not part
  of the change and nothing could tell later whether they moved.
- **The lines a comment names.** The new file's numbers of the selected lines that exist in it (added and
  unchanged), first to last. When every selected line is removed, the old file's numbers followed by
  ` (removed)`. One line is `13`, a range `13-14`.
- **The text typed.** Comments ordered by path, then by their first line, then by when they were written.
  Each starts a line `path:lines[ (removed)][ (outdated)]: first line of the comment`; the comment's other
  lines follow indented by two spaces (blank lines dropped); when it covers at most 3 lines, each is quoted
  below as `  > ` and the diff sign (`+`, `-` or a space) and the code, its trailing spaces trimmed and cut
  at 120 characters with `…`. Tabs become four spaces and control characters are dropped, so no text can
  end the bracketed paste early or press a key. Lines are joined with a newline and the text ends without
  one, so nothing is sent until the developer presses Enter.
- **Across refreshes.** After every read each comment looks for its lines (the same kinds and texts, in
  order, inside one hunk) in its file's change; found, it moves to their new numbers (the match nearest
  its old numbers wins); not found, or with its file gone, it keeps its last numbers and turns outdated. An
  outdated comment that finds its lines again is current again. An outdated comment sits under its file's
  header with its quoted lines and an "Outdated" label; one whose file left the change sits at the end of
  the diff under "Outdated comments". Outdated comments are still sent, marked ` (outdated)`, since they
  are the developer's words. A file folded as viewed or collapsed shows its comment count in its header.
- **The send key.** Ctrl+Shift+Enter (⇧⌘Enter on the Mac): free in D13 and in Claude Code, and next to
  Ctrl+Enter, which saves one comment. It works from the review and from the tab's terminal, and does
  nothing when no comment is pending. A comment still open in its field is saved first when it has text.
  After sending, the keys go to the terminal.

| Id | Criterion | Verification |
| --- | --- | --- |
| R16 | Click, Shift+click and Shift+↑↓ select a range of one hunk; `c` and the gutter "+" open the comment field for it, or for the cursor's line | Tests |
| R17 | A pending comment shows under its last line; Ctrl+Enter saves, Esc cancels, an empty comment cannot be saved; Enter and the edit button edit it, Delete and the delete button remove it | Tests, screenshots |
| R18 | "Send to agent" shows the count and, like Ctrl+Shift+Enter, types every pending comment at the tab's prompt as one paste with no Enter, clears them and gives the keys to the terminal | Tests, a real-app run |
| R19 | The typed text follows the rules above: lines, `(removed)`, `(outdated)`, the quote, the order, no control characters, no final newline | Tests in `core` |
| R20 | A refresh moves a comment with its lines, marks it outdated when they are gone and current again when they come back; outdated comments show under their file or at the end and are still sent | Tests in `core` and `ui` |
| R21 | Both themes, both languages, contrast checks for the selected lines, screen reader names for comments and selection | Tests, contrast check, screenshots |

- [ ] RV-T15. `core`: the comment model, the lines a comment names, the typed text and finding a comment's
  lines after a read, pure and tested. (R19, R20)
- [ ] RV-T16. `core`: `changeRows` places comment rows under their last line, outdated ones under the file
  header and the ones whose file left the change at the end. (R17, R20)
- [ ] RV-T17. `ui`: the selection (click, Shift+click, Shift+↑↓) inside a hunk, the gutter "+" and `c`, and
  the selected lines' tint with its contrast checks. (R16, R21)
- [ ] RV-T18. `ui`: pending comments inline, the comment field (Esc, Ctrl+Enter), edit and delete, both
  catalogs. (R17, R21)
- [ ] RV-T19. `ui`: "Send to agent" in the header, Ctrl+Shift+Enter, the terminal's paste, comments kept
  across refreshes. (R18, R20)
- [ ] RV-T20. Docs: README's key table, D56, the roadmap; screenshots in both themes and languages.

## Acceptance criteria

| Id | Criterion | Verification |
| --- | --- | --- |
| R1 | Ctrl+Shift+D opens the review beside the terminal of the current tab and closes it; Esc returns the focus to the terminal; the divider resizes by mouse and keyboard | Tests, screenshots |
| R2 | The review shows the uncommitted changes of the tab's repository, untracked files included, and the select switches to the branch against its base | Tests with a real temporary repository |
| R3 | Lines show old and new numbers, added and removed backgrounds, changed words marked, hunk headers, and collapsed unchanged lines that expand | Tests, screenshots |
| R4 | Binary, large, generated, renamed, mode-changed, CRLF and non-UTF-8 files are shown for what they are | Tests with fixtures |
| R5 | The review refreshes on Ctrl+R and when the tab's agent changes state, and runs nothing while closed | Tests with a fake clock |
| R6 | A 10 000-line diff opens in under 300 ms and scrolls at 60 fps | Measured |
| R7 | Keyboard only, screen reader names for files, hunks and lines, both themes, both languages, design system | Tests, screenshots |
| R8 | Outside a Git repository, with no changes and with a failing `git`, the review says so and nothing breaks | Tests |

## Tasks

- [x] RV-T1. `core`: the pane model of a tab (one or two panes, ratio, focus), pure and tested.
- [x] RV-T2. `core`: the diff model, the unified diff parser and the word change marking; the
  `DiffSource` port. (R3, R4) Core pairs the removed and added lines; the word comparison itself is
  jsdiff in `ui`, as decided. The rows of a file (hunks, collapsed gaps, expanded lines) are pure here too.
- [x] RV-T3. `node-git`: the diff adapter for both scopes, untracked files, the base branch, edge cases,
  tested against temporary repositories. (R2, R4, R8) Untracked files go through `diff --no-index` one
  by one (at most 300, 8 at a time) so the index is never written; one over 1 MB is listed with its size.
  New error domain `GIT` (`DCK-GIT-001` to `005`).
- [x] RV-T4. Shell and host API: the diff channel, validated with zod, for the tab's folder. (R2) Also a
  `review:file` channel for the lines a diff left out, answered only for a root a diff returned.
- [x] RV-T5. Interface: the split with its divider, the review pane (header with scope select and totals,
  file list, virtualized diff), keyboard, refresh rules, both catalogs, screenshots. (R1, R3, R5, R6, R7, R8)
  The file list and the diff stack in a pane of usual width and sit side by side from 820px. R6 measured
  under Xvfb: Ctrl+Shift+D to the file list 113 ms, "Show anyway" to the painted 10 000-line diff 25 ms,
  240 scrolled frames at a 16.7 ms median with none dropped and about 54 rows in the page.
- [x] RV-T6. Docs: decision record, roadmap (milestone 3), shortcuts. D47 (D45 and D46 were taken),
  the README's key table.

## Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| The split crowds a narrow window | Neither side is readable | A minimum width per pane; below it the review takes the tab |
| A huge diff (a vendored folder, a lock file) | Slow open, memory | Size limits per file and in total, collapsed files, virtualized lines |
| The pane model grows into a layout system too early | Complexity now | Only one or two panes in this plan; the 2/4/6 layout has its own plan |

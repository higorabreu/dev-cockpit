# Review: what the agent changed

**Status:** Done: phases 1 and 1b shipped in 0.5.0, phase 1c in 0.8.0 and phase 2 in 0.9.0 (D47, D48, D55, D56).

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
agent in the tab at once: written to a Markdown file, with one line naming it typed at the terminal's
prompt, without Enter, so the developer can add a word and send it, whatever agent is listening.

Decided with the maintainer (2026-11-17):

- **Selection, as on GitHub.** A click on a line selects it and Shift+click on another selects the range;
  from the keyboard Shift+↑↓ extends the selection from the cursor. `c` opens a comment field for the
  selected lines, or the cursor's line when nothing is selected. The mouse path is a small "+" on the
  gutter of the line under the pointer, with `c` in its tooltip.
- **Batched like a GitHub review.** Comments stay pending in the diff, under their lines, editable and
  deletable. "Send to agent" in the review header, with the count, hands all of them over, then clears
  them. Esc in the field cancels; Ctrl+Enter saves.
- **A file and one line** (revised by the maintainer after the first version, which pasted every comment
  as `path:lines: comment` lines; a multi-line paste presses Enter at each line break in a program that
  did not ask for bracketed paste, and a long review crowds the prompt). The comments go to a structured
  Markdown file; the prompt gets one line, "Address the review comments in <path>", in the interface
  language, without Enter and without a line break. Nothing assumes Claude Code.
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
- **Where the file goes.** In the repository's git folder, `<git dir>/dck/review-<YYYYMMDD-HHMMSS>.md`,
  when that folder is inside the repository (a usual clone, `<root>/.git`): an agent reads it without a
  permission prompt, since it is inside the project, and git never lists it. A linked worktree or a
  submodule keeps its git folder elsewhere, so there the file goes to the system's temporary folder as
  `dck-review-<stamp>.md`. The folder is created 0700 and the file 0600, written whole to a temporary
  name and renamed; a second review in the same second gets `-2`. Only the newest 5 review files of the
  folder stay. The write is the `ReviewNotes` port, its adapter in `node-git` (`git rev-parse
  --absolute-git-dir`), behind a host channel that only takes a root a diff returned. A failure is
  `DCK-GIT-006` and its text shows in the review header for 8 s; the comments stay pending.
- **The file.** Markdown in the interface language: a title; one line with how many comments on how many
  files and that the numbers are the working tree's (the old file's for removed lines); one `##` section
  per file by path; per comment, by line, a `###` heading with its lines ("Lines 9-10", "Removed line 10",
  plus "(outdated: the lines changed after this comment)"), a fenced `diff` block quoting all its lines
  with their signs (at most 40, then a note with how many more), and the comment as written. The fence is
  longer than any run of backticks in the code, 3 at least.
- **The line typed.** en "Address the review comments in {path}", pt-BR "Resolva os comentários da revisão
  em {path}". The path is relative to the tab's current folder when the file is inside it
  (`.git/dck/review-20261117-143000.md` from the repository's top), else absolute, and quoted for a POSIX
  shell only when it needs it. The comments are cleared only when the file was written and the line
  reached the terminal.
- **Across refreshes.** After every read each comment looks for its lines (the same kinds and texts, in
  order, inside one hunk) in its file's change; found, it moves to their new numbers (the match nearest
  its old numbers wins); not found, or with its file gone, it keeps its last numbers and turns outdated. An
  outdated comment that finds its lines again is current again. An outdated comment sits under its file's
  header with its quoted lines and an "Outdated" label; one whose file left the change sits at the end of
  the diff under "Outdated comments". Outdated comments are still sent, marked outdated and under their
  path, since they are the developer's words. Each file header counts its pending comments, so a file
  folded as viewed or collapsed still says it has some.
- **The send key.** Ctrl+Shift+Enter (⇧⌘Enter on the Mac): free in D13 and in Claude Code, and next to
  Ctrl+Enter, which saves one comment. It works from the review and from the tab's terminal, and does
  nothing when no comment is pending. A comment still open in its field is saved first when it has text.
  After sending, the keys go to the terminal.

**Sending by what runs in the tab** (decided by the maintainer, 2026-11-17, after using the first version:
with only a shell at its prompt the line landed in bash and the comments left the pane). What the button
and the key do is decided by the tab's foreground process, read fresh at the moment of sending
(`session.activity`), and the button's state follows the activity the tab watcher already reads every 2 s
while the review is open, with no poll of its own. The label stays "Send to agent" in every case:

- **An agent runs** (`agent`): as before, the line is typed and the comments are cleared.
- **Anything else** (`idle`, a shell at its prompt; `busy`, vim or a test run): the button is disabled
  (`aria-disabled`, still focusable so its tooltip shows) and its tooltip says why, naming no agent: "No
  agent in this tab" at a prompt, "{process} is running in this tab" under another program ("A program",
  when its name cannot be read). The key shows the same sentence in the header for 8 s. The comments stay.
- **The key follows the same rules,** and the comments are cleared only when the line was typed. With no
  read of the tab yet, the line is typed as before. The reason is `reviewSendBlock` in
  `core/src/diff/review-notes.ts`, pure and tested.
- **Dropped: starting an agent from the review** (the maintainer, 2026-11-17, after it merged in #72). At a
  shell prompt the button typed `<launch> '<the line>'` for an installed agent (`AgentProfile.launch`, a
  PATH lookup in the main process through `agent:launchable`, the tabs' shell asked for its PATH once, a
  menu to pick among several). It made the cockpit know how each agent starts, against keeping dck
  agent-neutral (D24), and cost a host channel, a shell run and a menu for a step the developer does with
  one word; so it came out whole. Opening the agent is the developer's.

| Id | Criterion | Verification |
| --- | --- | --- |
| R16 | Click, Shift+click and Shift+↑↓ select a range of one hunk; `c` and the gutter "+" open the comment field for it, or for the cursor's line | Tests |
| R17 | A pending comment shows under its last line; Ctrl+Enter saves, Esc cancels, an empty comment cannot be saved; Enter and the edit button edit it, Delete and the delete button remove it | Tests, screenshots |
| R18 | "Send to agent" shows the count and, like Ctrl+Shift+Enter, writes every pending comment to the review file and types one line naming it at the tab's prompt, with no Enter; it clears them only when both worked and gives the keys to the terminal | Tests, a real-app run |
| R19 | The file follows the rules above (sections, headings, the diff quote and its cap, a safe fence, both languages); it sits in the git folder of a usual clone, out of `git status`, private, at most 5 kept, and in the temporary folder for a linked worktree | Tests in `core` and against real repositories |
| R20 | A refresh moves a comment with its lines, marks it outdated when they are gone and current again when they come back; outdated comments show under their file or at the end and are still sent | Tests in `core` and `ui` |
| R21 | Both themes, both languages, contrast checks for the selected lines, screen reader names for comments and selection | Tests, contrast check, screenshots |
| R22 | The button and Ctrl+Shift+Enter type the line only while an agent runs in the tab, read fresh at sending; at a shell prompt or under another program the button is disabled with the reason in its tooltip, naming the program when there is one, the key says it in the header and the comments stay; the state follows the tab's activity; both languages | Tests, a real-app run |

- [x] RV-T15. `core`: the comment model, the lines a comment names and finding a comment's lines after a
  read, pure and tested. (R20)
- [x] RV-T16. `core`: `changeRows` places comment rows under their last line, outdated ones under the file
  header and the ones whose file left the change at the end. (R17, R20)
- [x] RV-T17. `ui`: the selection (click, Shift+click, Shift+↑↓) inside a hunk, the gutter "+" and `c`, and
  the selected lines' tint with its contrast checks. (R16, R21) The range rule is pure in
  `core/src/diff/selection.ts`; the tint is `mix.lineSelected` (12% of the text color over the line's own),
  with the numbers and signs in the text color, since the line inks fall under 4.5:1 on a tinted line.
- [x] RV-T18. `ui`: pending comments inline, the comment field (Esc, Ctrl+Enter), edit and delete, both
  catalogs. (R17, R21) The field floats over its row outside the virtualized rows, so a scroll never
  takes its focus; a card's height is measured once drawn, as its text wraps. Delete is ⌫ on the Mac.
- [x] RV-T19. `ui`: "Send to agent" in the header, Ctrl+Shift+Enter, the terminal's paste, comments kept
  across refreshes. (R18, R20) Checked in the real app under Xvfb in both themes and languages: bash 5.2
  holds the pasted block highlighted at its prompt and runs nothing, from the button and from
  Ctrl+Shift+Enter in the terminal; a commented line changed from the terminal turned the comment
  outdated at the next check.
- [x] RV-T20. Docs: README's key table, D56, the roadmap; screenshots in both themes and languages.
- [x] RV-T21. `core`: the review file's Markdown (`review-markdown.ts`), its name, which old files go and
  the typed line (`review-notes.ts`), pure and tested; the `ReviewNotes` port, `DCK-GIT-006` in both
  catalogs. (R19)
- [x] RV-T22. `node-git`: the adapter, tested against a temporary repository and a linked worktree; the
  `review:notes` channel with zod and the known roots; the pane writes, then types the line, and keeps the
  comments on any failure. (R18, R19) Checked in the real app under Xvfb in both themes and languages:
  the line waits at the bash prompt, the file reads well with `cat`, `git status` does not list it, and in
  a linked worktree the line names `/tmp/dck-review-<stamp>.md`.
- [x] RV-T23. Dropped (the maintainer, 2026-11-17: agent-neutral and lighter): `AgentProfile.launch`, the
  launch text, the PATH lookup and the `agent:launchable` channel, merged in #72 and removed.
- [x] RV-T24. `ui`: the send button by activity (`aria-disabled`, the reason in its tooltip and in the
  header from the key), the fresh read at sending, the watcher keeping it in step, both catalogs; D56 and
  the README. (R22) The agent menu and the remembered choice of #72 were dropped with RV-T23. Checked in
  the real app under Xvfb in both themes and languages: at the bash prompt the button is disabled with
  "No agent in this tab" and the comments stay; with a stand-in `claude` in the
  foreground the line is typed into it; with `sleep 60` it is disabled with "sleep is running in the
  terminal".
- [x] RV-T25. Dropped with RV-T23: the tabs' PATH read from their own shell existed only to find an agent
  to start. The Mac's boot PATH read is back in `platform/darwin/login-path.ts`, as before #72.

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

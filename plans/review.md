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
  branch is the merge base with the remote's default branch (`origin/HEAD`), else `main` or `master`.
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

## Phase 2: comments back to the agent

Select one or more lines, write a comment, and "Send to the agent" types a short review (file, line,
comment) into the tab's prompt without Enter, so any agent can take it. Detailed when phase 1 is used.

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
- [ ] RV-T4. Shell and host API: the diff channel, validated with zod, for the tab's folder. (R2)
- [ ] RV-T5. Interface: the split with its divider, the review pane (header with scope select and totals,
  file list, virtualized diff), keyboard, refresh rules, both catalogs, screenshots. (R1, R3, R5, R6, R7, R8)
- [ ] RV-T6. Docs: decision record, roadmap (milestone 3), shortcuts.

## Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| The split crowds a narrow window | Neither side is readable | A minimum width per pane; below it the review takes the tab |
| A huge diff (a vendored folder, a lock file) | Slow open, memory | Size limits per file and in total, collapsed files, virtualized lines |
| The pane model grows into a layout system too early | Complexity now | Only one or two panes in this plan; the 2/4/6 layout has its own plan |

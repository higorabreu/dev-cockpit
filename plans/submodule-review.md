# Review: the changes inside submodules

## Goal

Today the review shows a changed submodule as one file whose diff is `Subproject commit <old>` /
`Subproject commit <new>-dirty`: the developer cannot read what changed inside, and the Git section of the
panel lists submodules with rows that do nothing. Untracked files past the 300th are dropped with no sign.

## Decided with the maintainer (2026-11-18)

- **Same review, real diffs.** A submodule's files appear in the review with their diffs, in every scope
  (uncommitted, unpushed, branch) and at every nesting level. Its new commits and its uncommitted changes
  show together in one diff, as `git diff --submodule=diff` does; its untracked files are included, like
  the parent's.
- **A group per submodule in the index.** A header that collapses, with the submodule's path, a
  "submodule" tag, its file count and its new commits; its files under it, with paths relative to the
  submodule. The parent's own files stay as today; a nested submodule nests the same way. In the diff each
  file header keeps the full path with the submodule part set apart, as the folder part is dimmed today.
  Comments, Viewed, `[` `]`, `n` `p` and "Send to agent" work as on any file, with paths from the parent's
  root.
- **The new commits in the header.** Up to 3 subjects inline, then "+ N commits"; the design system's
  tooltip lists them, compact: one line per commit cut at about 60 characters, at most 10, then "+ N more".
- **From the panel.** A click on a submodule row of the Git section, or Enter on it, opens the review on
  that submodule's group.
- **No file left out.** The index always lists every changed file (the parent's, the submodules', the
  untracked ones). The limit of 300 untracked files only stops reading content: a file past it shows
  "Content not loaded" and loads its diff when clicked or on Enter. The 1 MB per file and 32 MB per diff
  limits keep their notices, and the same rules count submodule files.
- **Auto-refresh sees inside.** The fingerprint notices an edit inside a submodule's files without getting
  expensive on a large repository.

## How

- `node-git` reads each submodule as its own repository: the diff from the commit the parent recorded at
  the scope's start to the submodule's working tree (what `--submodule=diff` prints, with clean paths), its
  untracked files, its new commits (`log old..HEAD`, 10 subjects and the count) and, recursively, its own
  submodules. A submodule with only untracked files is not in `git diff`, so the parent's `git status`
  names those. A submodule that cannot be read (not checked out, its old commit missing, deleted) stays
  the single entry it is today.
- `core` gains `DiffModule` and a file's `module`, the order of the files (the parent's, then each
  submodule depth first) and the rows of the index (headers, files, depth, collapse), pure and tested.
- The fingerprint adds the status of each changed submodule, recursively, within the same budget of
  stamped paths and a cap on submodule reads.

| Id | Criterion | Verification |
| --- | --- | --- |
| S1 | A change inside a submodule, nested or not, shows its files with real diffs in the three scopes; new commits and uncommitted edits in one diff; untracked files included | Tests against real repositories |
| S2 | The index groups each submodule under a header that collapses (mouse and keys), with path, tag, count and commits; files relative to it; nested groups nest; the diff headers set the submodule part apart | Tests, screenshots |
| S3 | Comments, Viewed, keys and "Send to agent" work on submodule files with paths from the parent's root | Tests |
| S4 | The commits tooltip is the design system's, one line per commit cut near 60 characters, at most 10, then "+ N more" | Tests, screenshot |
| S5 | A click or Enter on a submodule row of the panel opens the review on its group | Tests, real-app run |
| S6 | Every changed file is listed; past 300 untracked files a file says "Content not loaded" and loads on click or Enter | Tests, screenshots |
| S7 | An edit inside a submodule's file changes the fingerprint; the cost stays bounded | Tests |
| S8 | Both catalogs, tokens only, keyboard with visible focus, state not by color alone, both themes | Tests, screenshots |

## Tasks

- [x] SM-T1. `core`: `DiffModule`, a file's `module`, the files' order, the index rows with collapse, the
  `unloaded` notice; tests. (S1, S2, S6) The parser now marks a submodule with only edits inside: git
  prints no `index` line for it, so it read as a text file named after the folder.
- [x] SM-T2. `node-git`: submodules read recursively in every scope, their untracked files, their commits,
  the shared limits; tests against real repositories with a nested submodule. (S1, S6) The commits are
  those after the recorded one up to the submodule's HEAD (`log old..HEAD`); a submodule moved back
  shows its files and no commit. The 32 MB limit counts the diffs of every repository together.
- [x] SM-T3. `ui`: the groups in the index, the submodule part in the diff headers, the commits line and its
  tooltip, both catalogs. (S2, S3, S4, S8) The index is a `tree`: ↑↓ along the rows, ← folds or climbs to
  the header, → opens, Enter or a click folds a header; a header takes the diff to its group's first file.
  A nested header names its folder from the submodule that holds it. The tooltip kit draws a text of
  several lines one per line, each cut by an ellipsis. In the index a file past the reading limit says
  "Not loaded" (the whole "Content not loaded" in its tooltip with Enter): the long form cut the file
  name in a 240px index.
- [x] SM-T4. Every untracked file listed, "Content not loaded" and the diff loaded on demand through a host
  channel. (S6) The listing reads with the status's 8 MB budget instead of 1 MB, a file git cannot diff
  stays listed as not loaded, and the on-demand read is `review:untracked`, only for a known root and a
  path that stays inside it.
- [x] SM-T5. The fingerprint reads inside changed submodules, bounded. (S7) It adds the status of each
  submodule the parent's status lists as changed, nested ones too, at most 16 and one at a time, with the
  2000 stamped paths shared. It also stamps paths from the repository's top: the status names them from
  there, so a review opened from a subfolder never saw a second edit of a file.
- [ ] SM-T6. The panel's submodule rows open the review on their group. (S5)
- [ ] SM-T7. D70, the README's review section, the roadmap; checked in the real app under Xvfb in both
  themes, both languages and both layouts. (S8)

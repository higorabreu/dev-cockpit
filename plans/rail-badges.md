# Rail dots: Sessions and Work say that something waits

**Status:** Done, in the 0.11.0 release (D73).

## Goal

The rail says that something waits for the user without a number and without growing the tooltip. The
Sessions button and the Work button get a small dot while something waits; the tooltip stays the title
and its keys, and only the screen reader hears how many.

## Decisions (the maintainer's, 2026-11-18)

- **Dot, no number.** First a capped count ("9+") was tried; the maintainer chose a dot instead. It is the
  dot the app already uses (the settings file warning, the compact update icon): 6px, round, a 1.5px ring
  in the window color cutting it out of the icon, at the icon's upper right so it covers as little of the
  glyph as possible. Its color is the neutral foreground, not the warning color: nothing is wrong.
- **Tooltip and label.** The tooltip is the title and its keys, as before. The label adds the count for
  the screen reader in one short key: "Work, 4 items waiting", "Trabalho, 4 itens aguardando".
- **One helper.** `ui/src/kit/rail-dot.ts` draws the dot and writes the label for the panel sections and
  the Work button. A section's `waiting()` returns its count.
- **What Work counts.** A connector view declares its role with `badge`: `review` counts every item
  (GitLab `review`, GitHub `github-review`), `attention` counts the user's own merge requests that need
  them (GitLab `mine`, GitHub `github-mine`). The per-service plural keys (`views.waiting`,
  `views.github.waiting`, `views.waiting.any`) go away.
- **Attention rule.** `needsAttention` in `core/src/views/attention.ts`: a merge request needs the user
  while its CI failed, or when it has an open discussion and its `updatedAt` is newer than the version the
  user last saw listed (never seen counts).
- **Seen marks.** Per machine, in `localStorage` (`dck-seen-v1`), view id -> item id -> `updatedAt`. Showing
  an `attention` tab in the Work screen, with the window visible, marks every item it lists; a fetched list
  of that view drops the marks of items no longer in it. Unreadable storage is ignored: the marks then last
  only for the run.
- **Freshness.** Warming refreshes the `attention` views as well as the `review` ones, so the dot follows
  the window being shown; the language change rewrites the label.

## Acceptance criteria

| Id | Criterion | Check |
| --- | --- | --- |
| B1 | A dot shows while something waits and goes when nothing does; the tooltip stays the title | `rail-dot.test.ts`, screenshots |
| B2 | The dot sits on the device pixel grid at scale 2, with its ring, and covers little of the icon | Screenshots with 4x crops |
| B3 | The label gives the count to the screen reader in both languages | `rail-dot.test.ts` |
| B4 | The Work count adds the reviews and the user's merge requests that need them | `views-view.test.ts` |
| B5 | A failed CI counts while it fails; an open discussion counts until its version is seen | `attention.test.ts` |
| B6 | Opening the attention tab clears its discussions from the count; unlisted marks are dropped | `views-view.test.ts`, `seen-marks.test.ts` |

## Tasks

- [x] RB-T1. The attention rule in core, with tests. (B5)
- [x] RB-T2. The `badge` role on connector views; the label key in both catalogs. (B3, B4)
- [x] RB-T3. `kit/rail-dot.ts`, the rail sections and the Work button through it; the dot style. (B1, B2)
- [x] RB-T4. Seen marks and the Work count in the Work screen. (B4, B6)
- [x] RB-T5. D73, `docs/extensions.md`, screenshots in both themes and languages. (B1, B2)

# Rail badges: a capped count, and a visible one on Work

## Goal

The rail says how much waits for the user without growing: a badge reads 1 to 9 and then `9+`, in a pill
of one fixed size, and the exact count is in the button's tooltip and label. The Work button gets the same
badge, counting the merge requests waiting for the user's review and the user's own that need them.

## Decisions (the maintainer's, 2026-11-18)

- **Cap.** `formatBadge` in `core/src/attention/badge.ts`: nothing at 0, `1` to `9`, `9+` from 10. The pill
  has one width that holds `9+` at 9px weight 600; a single digit sits centered in it.
- **Tooltip and label.** One line, the button's title, a middle dot and what the count is: "Sessions · 12
  waiting for you", "Sessões · 12 aguardando você". With no badge, only the title, as before.
- **One helper.** `ui/src/kit/badge.ts` draws the pill and writes the tooltip and the label, for the panel
  sections' rail buttons and for the Work button alike. A section's `badge()` returns the count and its
  text, not a ready string.
- **Work counts two things.** A connector view declares what it adds to the badge with `badge`:
  `review` counts every item (GitLab `review`, GitHub `github-review`), `attention` counts the user's own
  merge requests that need them (GitLab `mine`, GitHub `github-mine`). The texts become generic, so the line
  stays short with one or two services: "Work · 3 to review, 1 of yours needs attention", "Trabalho · 3 para
  revisar, 1 seu requer atenção". The per-service plural keys (`views.waiting`, `views.github.waiting`,
  `views.waiting.any`) go away.
- **Attention rule.** `needsAttention` in `core/src/views/attention.ts`: a merge request needs the user
  while its CI failed, or when it has an open discussion and its `updatedAt` is newer than the version the
  user last saw listed (never seen counts).
- **Seen marks.** Per machine, in `localStorage` (`dck-seen-v1`), view id -> item id -> `updatedAt`. Showing
  an `attention` tab in the Work screen, with the window visible, marks every item it lists; a fresh list of
  that view drops the marks of items no longer in it. Unreadable storage is ignored: the marks then last
  only for the run.
- **Freshness.** Warming refreshes the `attention` views as well as the `review` ones, so the count follows
  the window being shown; the language change redraws the line, as the old label did.

## Acceptance criteria

| Id | Criterion | Check |
| --- | --- | --- |
| B1 | 1 to 9 show as the number, 10 or more as `9+`, 0 shows no pill | `badge.test.ts` (core) |
| B2 | The pill keeps one size for `1`, `9` and `9+`, its text centered | Screenshots at scale 2 |
| B3 | The Sessions button's tooltip and label give the exact count in both languages | `badge.test.ts` (ui), screenshots |
| B4 | The Work badge adds the reviews and the user's merge requests that need them | `views-view.test.ts` |
| B5 | A failed CI counts while it fails; an open discussion counts until its version is seen | `attention.test.ts` |
| B6 | Opening the attention tab clears its discussions from the count; unlisted marks are dropped | `views-view.test.ts`, `seen-marks.test.ts` |
| B7 | The Work tooltip gives the breakdown in one line, and only the title with zero | `work-badge.test.ts`, screenshots |

## Tasks

- [x] RB-T1. `formatBadge` and the attention rule in core, with tests. (B1, B5)
- [x] RB-T2. The `badge` role on connector views, the generic texts in both catalogs. (B4, B7)
- [x] RB-T3. `kit/badge.ts`, the rail sections and the Work button through it; the fixed pill. (B2, B3)
- [x] RB-T4. Seen marks and the Work count in the Work screen. (B4, B6)
- [x] RB-T5. D73, `docs/extensions.md`, screenshots in both themes and languages. (B2, B3, B7)

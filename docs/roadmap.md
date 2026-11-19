# Roadmap

Five milestones, no dates. Only the current milestone has a detailed plan (in `plans/`); the following
ones stay here as intent until their turn comes.

| Milestone | Delivers | Proof | State |
| --- | --- | --- | --- |
| 0. Spike | Decides the shell (Electron or Tauri), the hotkey on X11, the permission hook and whether the review loop has signal | Five questions answered with numbers, no blind bet | Done: Electron confirmed (D3), the review loop dropped (D11) |
| 1. Minimal shell | A hotkey window with terminal, panel, projects and hook-based approvals | The author uses it in place of Guake for a week | 0.1.0 shipped. Deferred: approvals through a hook. Agent attention, the tab that needs you, shipped instead: through the agent's own hooks in 0.3.0 ([plans/agent-attention.md](../plans/agent-attention.md), D37) and through Codex's own status reports in 0.9.0 ([plans/codex.md](../plans/codex.md), D59) |
| 2. Flow | Real GitLab and Jira, day-to-day views, a user settings screen | The Mine and Review views replace opening Jira and GitLab | In progress: GitLab and Jira Cloud (0.4.0, D41) and GitHub (0.9.0, D57) connected as built-in connectors, with a dot on the Work button while something waits (D73); the settings screen and a `settings.json` like VS Code's (D65), every interface key the user's to change (D69) |
| E. Extensions | A small foundation (manifest, contribution points, sources), then connectors and interface contributions in an extension host, then a shared index | Each phase has its own criteria in the plan | Foundation done; the harness and packs were dropped (D36); installing from a folder, a git URL or npm is planned (D77); the next phase waits for a real use: [plans/extensions.md](../plans/extensions.md) (D35) |
| 3. Polish | A diff reader with comments, task refinement | Each item with its own criterion | In progress: the read-only review beside or below the terminal (Ctrl+Shift+D, D47, D48) is phases 1 and 1b of [plans/review.md](../plans/review.md), phase 1c keeps it up with the agent (D55) and phase 2 sends comments on its lines back to the agent (D56); it reads inside submodules and lists every changed file ([plans/submodule-review.md](../plans/submodule-review.md), D70). Task refinement is not started |

## Recent releases

The full list is in [CHANGELOG.md](../CHANGELOG.md), generated from the commits.

- **0.9.0:** comments on review lines sent to the agent (D56) by what runs in the tab; GitHub pull
  requests in the Work screen (D57); Codex marks its tab (D59); tabs renamed in place and reopened on start
  (D62, D64); fonts, cursor and `settings.json` (D65, D66); the window's height set by dragging its bottom
  edge (D67); the Mac keyboard's line editing and Option keys (D68).
- **0.10.0:** every interface key and the hold menu trigger can be changed (D69); the review reads inside
  submodules and lists every changed file, and the panel's Git rows open it (D70); opt-in updates from
  GitHub releases (D71) and an About page (D72); the first Apple Silicon `.dmg` attached to a release.
- **0.11.0:** a dot on the Sessions and Work buttons while something
  waits (D73); a compact update notice on a narrow window and middle click to close a tab (D74); the Mac's
  right click menu and `⌘Q` asking while a tab runs a program (D75); `npx @devcockpit/install` (D76); the
  terminal's real background color and a readable selection in the light theme; untracked files read for
  the review in process.
- **0.12.0:** the window goes full height when its edge is dragged to the top (D80); the terminal cursor
  blinks with a timer instead of a per-frame animation (D58).
- **0.13.0:** files open over their tab
  ([plans/files.md](../plans/files.md)):
  - a file search on `Ctrl+Shift+O` (D82);
  - an editor that saves by itself and merges a change on disk (D81, D83), with VS Code's search hues
    (D87);
  - images, SVG, Markdown previews and PDF, and Compare per conflict (D85);
  - paths from the terminal and the review open at their line (D84).

  Every hairline is one device pixel (D86), and `dck toggle` loads only its socket code.

## Why this order

The shell comes first because it is what is used all day and builds the habit. The spike came before everything because the stack, the permission
hook and the signal of the review loop were still bets.

## How a milestone becomes work

1. Reread this file and [decisions.md](decisions.md).
2. Create `plans/<name>.md` with a goal, acceptance criteria and tasks as a checklist, aligning with the
   maintainers before starting.
3. Implement task by task and mark each one in the plan when done.
4. When the milestone closes, fill in the plan's results, update the table above and record in
   `decisions.md` whatever changed. A finished plan says so in a status line under its title, with the
   release that shipped it.

## Backlog of ideas (outside the milestones)

A graph of people and blockers, automatic context resumption, a "what if" simulation of deadlines, day
planning against the calendar, project actions for ops, Windows packaging. The macOS port ships an Apple
Silicon `.dmg` with each release since 0.10.0 and is still being tested on real Macs; what is left is in
[plans/macos.md](../plans/macos.md).

**Editing files** (asked by the maintainer, 2026-11-17) shipped in 0.13.0: CodeMirror 6 loaded on first
use, Lezer's colors, autosave with a merge of a change on disk, and the viewers for images, SVG, Markdown
and PDF ([plans/files.md](../plans/files.md), D81 to D87). Next for it, noted only: larger size limits
after measuring, user themes, and a smooth cursor and scrolling.

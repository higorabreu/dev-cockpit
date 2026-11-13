# Roadmap

Four milestones, no dates. Only the current milestone has a detailed plan (in `plans/`); the following
ones stay here as intent until their turn comes.

| Milestone | Delivers | Proof | State |
| --- | --- | --- | --- |
| 0. Spike | Decides the shell (Electron or Tauri), the hotkey on X11, the permission hook and whether the review loop has signal | Five questions answered with numbers, no blind bet | Done: Electron confirmed (D3), the review loop dropped (D11) |
| 1. Minimal shell | A hotkey window with terminal, panel, projects and hook-based approvals | The author uses it in place of Guake for a week | 0.1.0 shipped. Deferred: approvals through a hook. Agent attention, the tab that needs you, through the agent's own hooks: [plans/agent-attention.md](../plans/agent-attention.md) (D37) |
| 2. Flow | Real GitLab and Jira, day-to-day views, a user settings screen | The Mine and Review views replace opening Jira and GitLab | In progress: GitLab (Assigned, Created) and Jira Cloud (Tasks, read only) connected as built-in connectors (D41) |
| E. Extensions | A small foundation (manifest, contribution points, sources), then connectors and interface contributions in an extension host, then a shared index | Each phase has its own criteria in the plan | Foundation done; the harness and packs were dropped (D36); the next phase waits for a real use: [plans/extensions.md](../plans/extensions.md) (D35) |
| 3. Polish | A diff reader with comments, task refinement | Each item with its own criterion | Planned |

## Why this order

The shell comes first because it is what is used all day and builds the habit. The spike came before everything because the stack, the permission
hook and the signal of the review loop were still bets.

## How a milestone becomes work

1. Reread this file and [decisions.md](decisions.md).
2. Create `plans/<name>.md` with a goal, acceptance criteria and tasks as a checklist, aligning with the
   maintainers before starting.
3. Implement task by task and mark each one in the plan when done.
4. When the milestone closes, fill in the plan's results, update the table above and record in
   `decisions.md` whatever changed.

## Backlog of ideas (outside the milestones)

A graph of people and blockers, automatic context resumption, a "what if" simulation of deadlines, day
planning against the calendar, project actions for ops, Codex support, Windows packaging. The macOS
port has a plan in [plans/macos.md](../plans/macos.md).

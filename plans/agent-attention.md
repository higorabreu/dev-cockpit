# Agent attention

## Goal

With several coding agents open in the cockpit's tabs, the developer knows at a glance which tab needs them
and is told when the window is hidden. The question answered is "which tab needs me now", not "how many
tokens": the agent's own status line already shows its metrics in the same terminal.

Three states per tab, nothing more:

| State | Meaning | Shown |
| --- | --- | --- |
| Working | The agent is busy | Nothing new: the tab looks as it does today |
| Needs you | The agent stopped to ask (a permission, a question) | A mark on the tab, a notification when unseen |
| Your turn | The agent finished answering | The existing "finished" mark and notification |

## Principles

- **Agnostic.** The cockpit knows only the three states and one neutral command, `dck agent signal
  <working|needs-you|your-turn|ended>`. Nothing in `core`, the shell or the UI knows which agent sent it.
- **One small integration per agent.** Each agent is wired with its own public mechanism (Claude Code: its
  hooks) calling that command. The first one is Claude Code, shipped as a Claude Code plugin in this
  repository and installed with Claude Code's own `/plugin` command. Another agent is another small
  configuration file, not code in the cockpit.
- **Nothing written to the user's files.** No `settings.json` edit, no file in the repository. Without the
  integration everything behaves exactly as today.
- **Use, not configuration.** No settings screen, no new panel section.

## What was verified (2026-11-12, Claude Code 2.1.323, an interactive session in a pseudo terminal)

| Moment | Hook | Delay |
| --- | --- | --- |
| A prompt is sent | `UserPromptSubmit` | immediate |
| A permission dialog opens | `PermissionRequest` | 0.03 s |
| | `Notification` with `notification_type: permission_prompt` | about 6 s |
| The approved tool ran | `PostToolUse` | immediate |
| The answer is finished | `Stop` | about 1.5 s |
| Nobody came back | `Notification` with `notification_type: idle_prompt` | about 60 s after `Stop` |
| The session is closed | `SessionEnd` | immediate |

- Every hook inherits the terminal's environment, so `DCK_PTY_ID` names the tab.
- **Esc fires no hook.** An interrupted turn would stay "working". While it works, Claude Code redraws its
  spinner about nine times a second; when it waits, it writes nothing. So a tab marked working whose
  terminal has been quiet for a few seconds becomes "your turn".
- A `SubagentStop` follows every `Stop` even with no subagent: it is ignored.
- Claude Code emitted no bell and no terminal notification sequence, so the terminal alone cannot carry
  the signal; the hooks are needed.

## Mapping for Claude Code

| Hook | State |
| --- | --- |
| `UserPromptSubmit`, `PostToolUse` | working |
| `PermissionRequest`, `Notification` (`permission_prompt`, `elicitation_dialog`) | needs-you |
| `Stop`, `Notification` (`idle_prompt`) | your-turn |
| `SessionEnd` | ended |

Every hook is `async` and runs `command -v dck >/dev/null 2>&1 && dck agent signal <state> || true`, so a
teammate without the cockpit sees nothing and Claude Code is never slowed down.

## Acceptance criteria

| Id | Criterion | Verification |
| --- | --- | --- |
| A1 | A state signalled by a tab's agent reaches that tab within one second | Test, and a run with the real Claude Code |
| A2 | "Needs you" marks the tab and notifies when the tab is unseen, whatever the duration; "your turn" uses the existing finished rules (marked after 3 s of work, notified after the configured threshold) | Test |
| A3 | A working tab whose terminal stays quiet for 5 s becomes "your turn" (Esc) | Test with a fake clock |
| A4 | With no integration installed, the tabs, marks and notifications behave exactly as today | The existing tests, unchanged |
| A5 | `dck agent signal` outside a cockpit terminal, with the cockpit closed or with a bad argument exits 0, prints nothing and takes under 300 ms | Test and a measured run |
| A6 | The Claude Code plugin installs with `/plugin` from this repository and maps the hooks as above | A run with the real Claude Code, and a test that reads `hooks.json` |
| A7 | Another agent can be wired by configuration only: the docs show the neutral command and the states | Docs |
| A8 | The marks follow the design system in both themes and are announced to a screen reader | Screenshots and tests |

## Tasks

- [x] AA-T1. `core`: the neutral states and their rules in the attention tracker (needs you, your turn,
  ended, the quiet terminal fallback), pure and tested. (A2, A3, A4)
  Done in the tracker itself; it also drops the agent state when the agent's process leaves the
  foreground, and a repeated needs you notifies once while the tab is still marked.
- [x] AA-T2. `dck agent signal <state>`, an `agent.signal` daemon method relaying `{ ptyId, state }`, the
  shell passing it to the window, and the window feeding the tracker; the terminal output time per tab
  for the fallback. (A1, A5)
  User input comes from xterm's key events, not the write path, which also carries xterm's own replies
  (focus and cursor reports). Measured: about 200 ms per call with Node 22 and the source CLI.
- [x] AA-T3. Interface: the "needs you" mark on the tab and in the tab list, its notification text, "next
  finished" also visiting tabs that need you, both catalogs, screenshots in both themes. (A2, A8)
  Also in the Sessions panel and on the All tabs button for a hidden tab; the tab list dot, which had no
  style, now shows.
- [ ] AA-T4. The Claude Code plugin in `integrations/claude-code/` with a marketplace manifest, a test of
  its `hooks.json`, `docs/agents.md` (install, states, wiring another agent), and a run with the real
  Claude Code: install, a permission, an answer, Esc, a resumed session, a background subagent. (A6, A7)
- [x] AA-T5. Remove what D26 kept dormant and this replaces: the transcript and `statusLine` readers, `dck
  agent report|install|uninstall`, the agent inspector and reports in the shell. Record D37, update the
  roadmap. (A4)
  Also removed the `agent.report` method, the neutral session model and its texts; `AgentProfile` stays.

## Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Claude Code renames or changes a hook | The marks stop or go wrong | The mapping lives in one `hooks.json`; the fallback still clears "working" |
| A hook spawns `dck` on every tool call | CPU on long runs | `async` hooks, only `PostToolUse` among the tool events, and the command exits fast |
| A stale "needs you" after the user answers in the terminal | A wrong mark | Typing in the tab or a `working` signal clears it |

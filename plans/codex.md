# Codex

## Goal

A Codex CLI session in a cockpit tab gets the same marks as Claude Code (working, needs you, your turn,
ended) and shows as "Codex" in Sessions, without writing anything to the user's files and without coupling
the cockpit to Codex. The maintainer does not use Codex, so every claim below comes from Codex's source at
the tag `rust-v0.169.0`, its documentation, or a run of the installed `codex-cli 0.169.0` against a local
stand-in for the model API (no account).

## What Codex offers (verified 2026-11-17)

| Mechanism | What it gives | Source |
| --- | --- | --- |
| `notify` in `config.toml` | One program run with a JSON argument, only for `agent-turn-complete` | `codex-rs/hooks/src/legacy_notify.rs` ("legacy", marked for removal) |
| Lifecycle hooks (`hooks.json`, `[hooks]`, plugins) | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`, `Interrupt`, `SessionEnd` and more, JSON on stdin | [Hooks](https://developers.openai.com/codex/hooks), `codex-rs/hooks/schema/generated/` |
| OSC 7501 written by the TUI to its own terminal | `state=idle\|working\|blocked\|done\|error` with `app=codex` and `kind=permission\|question\|auth`; `state=clear` on exit, suspend and hand-off | `codex-rs/tui/src/terminal_program_status.rs`, since `rust-v0.163.0` |

OSC 7501 is the draft [Program Status Protocol](https://www.superlogical.com/rex/docs/build/program-status), a
generic terminal protocol also written by OpenTUI ([v0.6.3](https://opentui.com/docs/releases/0.6.3)).

### Why not `notify` or the hooks

- **They name the wrong tab.** Codex starts a shared background server by default (`daemon_auto_start`,
  stable and on in 0.169.0) and runs every session's turns, hooks and `notify` inside it, with the
  environment of the terminal that started it (`codex-rs/hooks/src/registry.rs` snapshots
  `std::env::vars_os()`; `codex-rs/app-server-daemon/src/backend/pid_start.rs` does not clear it). Run here:
  two TUIs with `DCK_PTY_ID` 21 and 22, a prompt in the second, and every hook and `notify` saw `21`, from
  the server's process. Only `--no-daemon` gave each its own id.
- **`notify` fires for side threads.** The title generator's turn ends with its own `agent-turn-complete`,
  seen here while the main turn was still waiting for an approval: a false "your turn".
- **Hooks need a review.** Codex skips new hooks until the user trusts them in `/hooks` or the startup
  prompt, and records the trust in `config.toml`.

OSC 7501 has none of these problems: the TUI writes it to its own terminal, so the tab is never in doubt,
in daemon mode too, and nothing is installed.

## Mapping

| OSC 7501 report | Cockpit state | Seen in the run |
| --- | --- | --- |
| `working` | working | a prompt sent, an approval answered |
| `blocked` (any `kind`) | needs you | an approval prompt opened |
| `done`, `error` | your turn | the answer finished |
| `idle` | the turn ends silently (the spec: a cancelled program reports `idle`) | Esc during a turn; also at start and after typing, where it changes nothing |
| `clear` | ended | `/exit` |
| a report with an `id` (a child record) | ignored: only the terminal's root record counts | not sent by Codex 0.169.0 |
| `?` (a query) | the cockpit answers `?`, as the spec asks of a terminal that supports it | not sent by Codex |

### What the cockpit cannot know

- Codex before 0.163.0 writes no OSC 7501: its tab shows only the process activity, as today.
- Codex inside tmux or screen in a tab: the multiplexer drops the sequence.
- Turns the TUI does not show (another thread in the agents view, `codex exec`, the desktop app or an IDE).
- A Codex killed with SIGKILL writes no `clear`; the tab's agent state goes when the process leaves the
  foreground, as for any agent.
- Codex started by `node` older than 22.15 (no `process.execve`) runs under a `node` process, so Sessions
  shows `node`; the marks still work, since they do not depend on the profile.

## Decisions

- The cockpit reads OSC 7501 from any program, not Codex: the core maps the protocol's states to its own
  four, and nothing knows which program wrote them (D24, D37). Recorded as D59.
- The Codex profile is `{ id: 'codex', name: 'Codex', processes: ['codex'] }`, checked on the real binary:
  `codex.js` replaces Node with the native `codex` through `process.execve`, so the foreground process is
  `codex`. It has no `connect`: there is nothing to install, so no hint is shown.
- No `integrations/codex/`, no `notify` bridge and no `config.toml` snippet: they would mark the wrong tab.
- Starting Codex with a first prompt: `codex "<prompt>"` opens the interactive TUI and sends the prompt as
  its first turn (`codex --help`: `Usage: codex [OPTIONS] [PROMPT]`, "Optional user prompt to start the
  session"; seen in a run, where `UserPromptSubmit` carried the argument). Not used: the review's start of
  an agent with a first prompt was dropped (D56, 2026-11-17), so profiles carry no launch command.

## Acceptance criteria

| Id | Criterion | Verification |
| --- | --- | --- |
| CX1 | Each OSC 7501 report Codex 0.169.0 writes maps as in the table; a malformed, unknown or child report changes nothing | Core test with the sequences from Codex's source |
| CX2 | `idle` after `working` or `blocked` ends the turn without a mark or a notification | Tracker test |
| CX3 | A report reaches only the tab whose terminal wrote it, and a query gets `?` back | Test of the terminal hook with a fake parser |
| CX4 | `codex` in the foreground shows as Codex, with no connect hint | Profile test |
| CX5 | Codex in a cockpit tab, with its shared server on, marks that tab "needs you" at an approval and "your turn" at the answer | A run of the built app with Codex 0.169.0 and a local stand-in for the model API |
| CX6 | Without a program that writes OSC 7501 nothing changes | The existing tests, unchanged |
| CX7 | Docs: a Codex section in `docs/agents.md`, the README, D59 | Review |

## Tasks

- [x] CX-T1. Core: `readProgramStatus` (OSC 7501 to a cockpit state) and the tracker's silent `rest`. (CX1, CX2)
- [x] CX-T2. UI: the OSC 7501 handler on each terminal, feeding the same path as `dck agent signal`, and the
  answer to a query. (CX3, CX6)
- [x] CX-T3. Shell: the Codex profile. (CX4)
- [x] CX-T4. Docs and D59. (CX7)
- [x] CX-T5. A run of the built app with Codex. (CX5)
  Built app under Xvfb, Codex 0.169.0 against a local stand-in for the model API, its shared server on:
  Sessions showed "Codex running"; a delayed approval in the first tab, while the second (whose Codex
  joined the server the first started) was on screen, marked only the first; an approval in the second
  marked it on screen; each answer cleared its mark; Esc in a turn and then hiding the tab left no mark;
  `/exit` returned to the shell. Screenshots in both themes and both languages. With `--no-daemon`,
  checked in tmux, Codex writes the same reports.

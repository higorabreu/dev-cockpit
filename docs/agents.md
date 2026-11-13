# Agents

How a coding agent running in a tab tells the cockpit that it needs you. The cockpit knows three states
and one command; it does not know which agent sent them. The design is in
[plans/agent-attention.md](../plans/agent-attention.md).

## The marks

| State | When | Shown |
| --- | --- | --- |
| Working | The agent is busy | Nothing new: the tab looks as it does without an agent |
| Needs you | The agent stopped to ask (a permission, a question) | A mark on the tab and in the tab list, and a notification when the tab is not on screen |
| Your turn | The agent finished answering | The usual "finished" mark and notification of a long command |

"Needs you" stays on the tab while the agent waits, even after a look at it, and is notified only when
the tab is out of sight. Typing in the tab, a new `working` signal or the agent leaving the terminal clears
it. "Next waiting for you" visits the tabs that need you first. Without an integration nothing changes:
the tabs, marks and notifications behave as they always did.

## How you find it

- **The hint in Sessions.** When a known agent runs in a tab and the cockpit has received no signal from
  that tab for 10 s, its row in the Sessions section shows "Connect it to see when it needs you", with
  Connect and Not now. A connected agent signals as soon as it starts, so it never shows the hint. The
  hint goes away on the first signal, when the agent leaves the terminal, after Connect, or with Not now,
  which turns it off until **Suggest connecting the agent** is checked again in Settings, System.
- **The hold menu.** Agent, **Connect to the cockpit** does the same from a shell prompt.

Connect types the agent's connect command into its tab without pressing Enter, so you read what will run
and confirm it yourself. At a shell prompt it types the shell command below. With the agent running it
types the agent's own form instead, since a shell command typed there would be sent as a message: for
Claude Code that is the same command after `!`, Claude Code's shell mode, which runs it without leaving
the session. The plugin then applies from the next session; `/reload-plugins` loads it in the open one.

## Claude Code

The integration is a Claude Code plugin in this repository, `integrations/claude-code/`, installed with
Claude Code's own commands. Inside a Claude Code session:

```text
/plugin marketplace add higorabreu/dev-cockpit
/plugin install dck@dev-cockpit
```

From a shell the same two steps are one line, the one Connect types:

```sh
claude plugin marketplace add higorabreu/dev-cockpit && claude plugin install dck@dev-cockpit
```

They apply to the next session, and `/reload-plugins` loads them in one already open.

To remove it: `/plugin uninstall dck@dev-cockpit`, or `/plugin marketplace remove dev-cockpit`, which
also uninstalls the plugin.

The plugin is one `hooks.json` and writes nothing: no file in your projects and no hook in your
settings (Claude Code itself records which plugins are installed). Each hook runs in the background and
calls `dck` only if it exists, so without the cockpit, or in a terminal outside it, the plugin does
nothing and Claude Code shows nothing.

| Claude Code hook | State |
| --- | --- |
| `SessionStart` (`startup`, `resume`) | your-turn, which only tells the cockpit the tab is connected |
| `UserPromptSubmit`, `PostToolUse` | working |
| `PermissionRequest`, `Notification` (`permission_prompt`, `elicitation_dialog`) | needs-you |
| `Stop`, `Notification` (`idle_prompt`) | your-turn |
| `SessionEnd` | ended |

Every hook runs `[ -n "$DCK_PTY_ID" ] && command -v dck >/dev/null 2>&1 && dck agent signal <state> || true`, with `async`.

**Esc fires no hook.** An interrupted turn would stay "working", so a working tab whose terminal has been
quiet for 5 s goes back to "your turn": while Claude Code works it redraws its spinner several times a
second, and when it waits it writes nothing. This is silent, with no mark and no notification, because the
user who pressed Esc is looking and a quiet agent may still be working.

## Another agent

Any agent that can run a command on its own events can be wired without code in the cockpit. From the
agent's own hook or notification setting, run:

```sh
dck agent signal <working|needs-you|your-turn|ended>
```

`working` when it starts or resumes work, `needs-you` when it waits for an answer, `your-turn` when it
finishes, `ended` when the session closes. The command finds its tab through `DCK_PTY_ID`, which every
cockpit terminal sets, and it is silent and exits 0 outside the cockpit, with the cockpit closed or with
a bad argument. For a configuration that is shared with people who do not use the cockpit, guard it as
the Claude Code plugin does:

```sh
[ -n "$DCK_PTY_ID" ] && command -v dck >/dev/null 2>&1 && dck agent signal your-turn || true
```

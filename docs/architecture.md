# Architecture

Dev Cockpit (package `devcockpit`, command `dck`) is a local cockpit for developers. It started as a
personal tool for day-to-day work and is now open for others to use and extend.

## The problem

A developer's work is a live graph (task, branch, commit, MR, pipeline, deploy), but the tools show
separate lists. Three pains add up: bureaucracy (worklogs, moving cards, PR descriptions, dailies),
resuming context after interruptions, and the inconsistency of how AI writes, comments and reviews
code.

## What the product does

1. **An embedded Guake-style terminal.** A global key opens and closes it, F11 toggles full height, and a
   collapsible side panel shows the context of the current task and the work queue.
2. **Work views** from GitLab (Jira next) as saved queries, never a mirror of the board: my merge
   requests with pending work, reviews waiting for me.
3. **Projects and submodules mapped**, with quick switching.
4. **An MCP server** (planned) for the Claude CLI to query the app: next task, briefing, project scope.

Out of scope for now: team use, accounts and permissions; being an IDE (the code reader is read-only
and prioritizes the diff of what the agent changed); Codex support (an agent is wired by configuration
through the neutral `dck agent signal`, D37); a security model against prompt injection (postponed; the minimal rule is that
external writes need approval); environment ops actions.

## Premises

Light, fast, good UX/UI, portable, simple. The detail and the performance budgets are in
[AGENTS.md](../AGENTS.md).

## Packages

```
packages/
  core/       pure domain, no I/O: ports, ipc, settings, tabs, views, i18n, ...
  design/     tokens.json and the CSS, terminal theme and contrast checks generated from it
  ui/         the app: DOM, xterm, styles
  daemon/     local process: IPC server, views, cache
  cli/        the dck command (toggle, ping, daemon, agent signal, ext)
  shell/      Electron: window, global shortcut, PTY host
  adapters/   node-pty, node-git, node-net, node-fetch, gitlab, docker-cli, secret-tool,
              gnome-shortcuts, linux-proc, extension-files
```

## How the pieces fit

- **`core` is pure.** It imports nothing from outside. Everything that touches the system (PTY, global
  shortcut, notifications, secret store, window, git, files, clock, HTTP) is a *port* in
  `core/src/ports`, and each implementation is an *adapter* in `packages/adapters/<name>`. Logic lives
  in the core and is tested with fakes; an adapter only translates the port to a technology's API.
  Adapters never import each other.
- **The daemon is separate from the interface.** The window, the CLI and (later) the MCP server are
  clients of the daemon over JSON-RPC 2.0 (a Unix socket, a named pipe on Windows), so the app can be
  closed while the daemon keeps working. The daemon is versioned and the shell replaces an outdated one.
- **The shell hosts the window.** `shell` is the Electron main process: the anchored window, the global
  shortcut, the PTY host, settings storage and the bridge to the UI. It composes adapters at startup
  (`shell/src/main.ts`) and passes them to the code that needs them.
- **The UI is plain TypeScript on the DOM.** It talks only to the shell, through a typed host API exposed
  by the preload script; the shell talks to the daemon and validates what comes back.
- **Agents are wired by configuration.** An agent's own hooks call `dck agent signal <state>`; the daemon
  relays it to the window, which marks the tab that needs the user. Nothing in the code knows which agent
  sent it (D37).
- **Design tokens** in `packages/design/tokens.json` generate the CSS variables and the terminal theme,
  so the terminal and the panel share one palette.
- **Portability.** No Unix assumption: paths through a library, no fixed `~/.config`, IPC behind an
  interface. The global shortcut has a plan B: `dck toggle`, which the user can bind to any system
  shortcut. macOS and Windows arrive as new adapters ([plans/macos.md](../plans/macos.md)).
- **Modules are a code boundary at first.** An external plugin contract only after two real connectors.

## Source layout

Source folders in `ui` and `shell` are grouped by feature or area, with tests beside the code:

```
ui/src/        main.ts, app.ts, then terminal/ tabs/ hold-menu/ panel/ projects/ views/
               settings/ kit/ platform/ styles/ types/
shell/src/     main.ts, preload.ts, then electron/ daemon/ projects/ settings/ inspectors/
               connections/ platform/linux/
```

A folder holds at most 12 source files and file names are lowercase kebab case; a test enforces both.

## Where to read more

- [docs/decisions.md](decisions.md): the decisions that shaped the project, with the reasons.
- [docs/roadmap.md](roadmap.md): milestones and what is next.
- [docs/extensions.md](extensions.md): the extension manifest, contribution points, sources and `dck ext list`.
- [AGENTS.md](../AGENTS.md): coding standards, tests, design system and process.
- [CONTRIBUTING.md](../CONTRIBUTING.md): how to set up, test and send a change.

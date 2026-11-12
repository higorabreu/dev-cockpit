# CLAUDE.md

Guidelines for coding agents and contributors in this repository. This file is a **router**: it says
what the project is, the rules that always apply and where to learn more. Project name: Dev Cockpit
(package `devcockpit`, command `dck`). Contribution workflow: [CONTRIBUTING.md](CONTRIBUTING.md).

## What it is

A local cockpit for developers: a Guake-style embedded terminal (a global key opens it, F11 toggles
full height) with a collapsible side panel, work views from GitLab (Jira next), mapped projects and
submodules, and a harness that defines how AI works (standards as data, applied by instruction, MCP
tools and validators, planned). Architecture, decisions and roadmap: [docs/](docs/).

## Premises (they outrank any implementation taste)

1. **Light.** Little idle memory, no unnecessary processes.
2. **Fast.** The hotkey shows the window with no perceptible wait; keys echo immediately.
3. **Good UX/UI.** Calm, dense, keyboard first, no AI look.
4. **Portable.** Linux first; macOS and Windows arrive as new adapters, without touching the core.
5. **Simple.** Readable code before any optimization or abstraction.

Performance budgets, kept as tests or checks when they can be measured: key to echo in the terminal
within one frame (16 ms); hotkey to visible window under 100 ms; idle memory (shell plus daemon) under
300 MB; cold start under 2 s; a 1000-item list scrolling at 60 fps (virtualized).

## Stack

- Node 24 LTS, pnpm workspaces, strict TypeScript
- Shell: Electron. Terminal: xterm.js (DOM renderer) with node-pty
- UI: TypeScript on the DOM with Vite, no framework; styles are plain CSS over generated design tokens
- Validation at the edges: zod. Logs: the injected `Logger`. Local daemon over JSON-RPC 2.0
- Lint and formatting: Biome. Tests: Vitest

Planned, not yet in the code: Radix UI and Tailwind for components, a local database, an MCP server for
the Claude CLI. If Electron ever exceeds the budgets, the shell is swapped (Tauri); because the daemon
and the UI are independent of it, the rest is reused.

## Structure

```
packages/
  core/       pure domain, no I/O: ports, ipc, settings, tabs, views, i18n, ...
  design/     tokens.json and the CSS, terminal theme and contrast checks generated from it
  ui/         the app: DOM, xterm, styles
  daemon/     local process: IPC server, views, cache
  cli/        the dck command (toggle, ping, agent)
  shell/      Electron: window, global shortcut, PTY host
  adapters/   node-pty, node-git, node-net, node-fetch, gitlab, docker-cli, secret-tool,
              gnome-shortcuts, linux-proc, agent-claude
docs/         architecture, decisions, roadmap
plans/        active public plans; `plans/local/` is git-ignored personal notes
```

Source folders in `ui` and `shell` are grouped by feature or area, with tests beside the code and only
the entry points (`main.ts`, `app.ts`, `preload.ts`) at the root of `src`. A folder holds at most 12
source files and file names are lowercase kebab case; `conventions.test.ts` checks both.

## Architecture and portability

- **Dependency rule:** `core` imports nothing from outside. Everything that touches the system sits behind
  a port (PTY, global shortcut, notification, secret store, window, git, files, clock, HTTP) and is
  implemented in `adapters/`.
- **Daemon separate from the interface.** Window, CLI and (later) MCP are clients of the daemon, and the
  app may be closed.
- No Unix assumption: paths through a library, never a fixed `~/.config`; no dependency on bash; IPC
  behind an interface (a socket on Unix, a named pipe on Windows).
- The global shortcut has a plan B: `dck toggle` in the CLI, for the user to bind to any system shortcut.
- Modules are a code boundary at first. An external plugin contract only after two real connectors; do
  not abstract before the second case.

## Code standards

- Strict TypeScript, no `any`. Single quotes, no semicolons (Biome).
- Clean, decoupled code. Modules depend on ports and small contracts, never on another module's
  implementation; dependencies come in as parameters, not through a singleton import; one responsibility
  per module and per function.
- Good names instead of comments. Comment only the essential: the why of a non-obvious decision, a
  workaround, a trap or an external constraint, in one dry line. No comment that describes what the code
  already says, no docblock on a trivial function, no excess.
- **Errors, as the code already does (`core/src/conventions.test.ts` covers what can be measured):**
  - An expected failure of an operation that can go wrong (network, secret store, protocol, daemon)
    returns `Result<T, ErrorBody>`, built with `fail(errorBody('DCK-X-001', detail))`. Never a bare
    `ErrorCode`, `string` or `Error` in place of the `ErrorBody`, and never `fail('DCK-...')` directly. The
    detail is context to reproduce (endpoint, status, OS code), without secrets.
  - Optional environment data (missing file, a process that vanished, unreadable third-party JSON)
    returns `undefined` or the default value, with `.catch(() => undefined)` or a `catch` that returns.
    A closed set of states uses a discriminated union by `kind` (`ComposeStatus`).
  - `throw` only for a bug or a violated precondition (`new Error('invariant: ...')`). `DckError` only
    inside an IPC handler, where the hub converts it to the code; an unexpected error becomes
    `DCK-IPC-002` and the detail goes to the log.
  - A `catch` is never empty: it converts to a `Result` or a default value, or logs and moves on, or
    carries one line saying why it is ignored (e.g. `localStorage` unavailable).
  - An invalid configuration or state file goes back to the default, warns with `logger.warn` and does
    not bring the app down. File writes are atomic (temporary file and `rename`).
- Error codes `DCK-{DOMAIN}-{SEQ}` in `error-codes.json`, with a unique RPC range; the message text lives
  in the i18n catalogs as `error.<code>`, in English and pt-BR. The domain is the subject in capitals,
  always three letters, today `IPC`, `DMN`, `SEC`, `NET` and `GLB`. An unused code is removed, never
  marked obsolete.
- Logs go through the injected `Logger` (`info`, `warn`, `error`), never `console` (only build scripts).
  English message, short, no final period, and the context in an object (`{ file, key, pid }`); the cause
  of an exception goes in `error: String(error)`. Levels: `error` failure, `warn` degradation, `info`
  relevant event. Never log a secret or expose a stack trace to clients.
- Structure: a `createX(dependencies)` function that returns an object implementing the port; a class
  only for a test fake, `DckError` and `LineDecoder`. Port in `core/src/ports`, adapter in
  `adapters/<name>` (`@dck/adapter-<name>`), receiving what touches the world (`fetch`, executor, the
  `/proc` root) as a parameter so tests can swap it. `core` imports neither packages nor `node:` modules
  and an adapter does not import another adapter.
- Configuration: everything that can have a default, has one. A secret or an environment address has no
  default and fails at boot. Secrets live in the system secret store behind the port, never in a file or
  log.
- Validate and sanitize every external input (ticket, MR, API response, user command) at the edges with
  zod.
- Writing to an external system (Jira, GitLab, files of other repositories) only with the user's
  approval and with an action log that allows undoing when possible.

## Language

- Everything that is not text shown to the end user is in English: code, comments, logs, error details,
  documentation, plans, issues, pull requests and commits. Portuguese exists only as a translation of
  the interface, in `i18n/pt-BR.ts`. A test keeps comments in English.
- No em dashes in UI text, docs or comments.

## Tests

- Name: `should [expected behavior] when [condition]`. Structure Arrange, Act, Assert.
- Every acceptance criterion of a plan has at least one test or check.
- Mock only external dependencies (network, disk, clock, process). The domain is tested without mocks.
- Performance budgets become tests or CI checks when there is a way to measure them.

## Design system

- Source of truth: `packages/design/tokens.json` (colors in the dark and light themes, typography,
  spacing, radius). The CSS variables and the xterm.js theme are generated from it, so terminal and
  panel share the same palette.
- No literal color, size or font in a component: always a token.
- Minimal components, keyboard accessible, with the shortcut visible beside the action.
- Direction: calm and dense, Linear style. A clean single-column list, state in shape and color
  together, only the semantic color draws attention. Minimal motion.
- AI is not a character: no chat bubble, sparkle icon, purple gradient or robot avatar. AI appears as a
  verifiable result (a diff to accept or reject, a suggestion with its source).
- **Tooltip:** only the design system's (`ui/src/kit/tooltip.ts`), never the native `title` attribute.
  Any text cut by an ellipsis shows its full content by itself, with no markup; `data-tip` always shows
  a text (icons, counters, arrows) and `data-tip-full` gives the full text when what is visible is only
  part of it. An icon with no visible label gets `data-tip` with its name. A shortcut goes in
  `data-tip-key`, never in the text.
- **Scrollbar:** only the design system's, the `scroll` class (transparent track, a thin thumb that only
  shows while scrolling or with the mouse over the list and thickens under the mouse, sizes in
  `size.scrollbar` of the tokens). Every scrolling list carries `scroll` and touches the card edges
  (the breathing room is padding inside it), so the bar is always at the same distance from the edge;
  the terminal uses the same tokens. The only exception: the tab strip scrolls horizontally without a
  bar, with a fade at the edge and the tab list as support. No `scrollbar-width` or
  `::-webkit-scrollbar` outside the component.
- Git and developer-tool terms follow VS Code, and the git verbs developers already use (pull, push,
  commit, branch). No free translation or invented labels such as "to send"; Incoming and Outgoing
  neither, because they are not what the user sees.
- Fonts: Inter for text, JetBrains Mono for keys, branches and commands.
- Interface text is direct and has no emoji. **All new text goes through the translator** (`@dck/core`,
  catalogs `i18n/pt-BR.ts` and `i18n/en.ts`, plural by `key.one` and `key.other`, parameters `{name}`):
  never a fixed text in a component. A test requires the same keys and the same parameters in both
  languages. The language follows the system, with the user's choice in the settings screen.

## Settings

- Single source: `settings.json` in the app's data directory, read and written only by the host
  (`shell/src/settings/settings-store.ts`) and validated by the model in `@dck/core`
  (`settings/settings.ts`). An invalid field goes back to its default by itself; a number out of range
  is clamped to the limit.
- **New setting:** add the field to `settingsSchema` with a default and limits, the row in
  `ui/src/settings/settings-view.ts` (with the text in both catalogs) and react to the change in
  `settings.onChange`. No `localStorage` for user preferences.
- `DCK_*` variables win over the file and show as locked on the screen
  (`shell/src/settings/env-overrides.ts`).
- A change the system may refuse (the global shortcut) goes through the store's `veto` and returns to
  the previous value.

## Accessibility

- Project standard: WCAG 2.2 level AA, in the dark and light themes.
- Text contrast of at least 4.5:1 (3:1 for large text) and icon, border and state indicator contrast of
  at least 3:1, measured against the element's real background. Do not use `opacity` to fade text or
  icons: contrast becomes unpredictable; use a solid color token.
- Contrast is verified by a test over the tokens in `packages/design`; a new token or color pair comes
  with its check.
- State never by color alone: selection and focus also change shape, outline or weight.
- Everything is keyboard operable, with visible focus, and motion respects `prefers-reduced-motion`.
- Every action with a keyboard shortcut can also be done with the mouse (button, menu or click), and the
  shortcut shows in its tooltip (`data-tip-key`). Every list scrolls with the mouse wheel, without
  depending on arrows. A new shortcut is born with its mouse path.
- With the transparent window the contrast guarantee holds for the default opacity (0.92); below that,
  the real desktop background starts to count.

## Process

- **Planning is light.** `docs/roadmap.md` keeps the milestones, `docs/decisions.md` the decisions and
  their reasons, and `plans/` one file per milestone or feature in progress, with the goal, acceptance
  criteria and tasks as a checklist. Personal notes go in `plans/local/`, which git ignores.
- Before implementing something non-trivial, write or update the plan. Implement task by task and mark
  it in the plan when done. An ambiguity that affects visible behavior: stop and ask before going on.
- A new or reverted decision goes in `docs/decisions.md`; when a milestone closes, update
  `docs/roadmap.md`.
- Small, isolated tasks (a clear bug, a style tweak) are just done.
- Commits: Conventional Commits in English, imperative: `feat: add toggle shortcut`. Small, organized
  commits: one per logical change (a plan task, a fix, a new rule), only with its files, never one giant
  commit at the end. Commits carry the author's `Signed-off-by` (see CONTRIBUTING.md); agents do not
  add co-author trailers. Before each commit run `pnpm lint`, `pnpm typecheck` and `pnpm test`; what
  counts is the exit code, not a `grep` of the output. Pushing needs a separate request.
- Before writing new code, reread the Code standards, Tests and Design system sections and open a
  neighboring file of the same kind (another port, another adapter) to copy the real format, not what
  seems natural. The existing code outweighs memory.
- Before calling it done: `pnpm lint`, `pnpm typecheck`, `pnpm test` (it includes
  `core/src/conventions.test.ts`, which covers the error, dependency, language, structure and test name
  rules) and check the affected budgets. A measurable rule of this file that gets broken becomes a test
  in that file, not just a sentence here.

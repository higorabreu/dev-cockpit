# AGENTS.md

Dev Cockpit (`dck`): a Guake-style terminal cockpit for developers, in TypeScript on Electron. These
are the instructions for any coding agent and for contributors; the workflow for sending a change is in
[CONTRIBUTING.md](CONTRIBUTING.md), the architecture and decisions in [docs/](docs/). Rules that only
matter for one area of the code live in `.claude/rules/` (plain markdown with a `paths` header): read the
ones that match the files you change.

## Commands

- `pnpm install`: install (Node 24 from `.nvmrc`, pnpm 9)
- `pnpm dev`: build and open a development cockpit (own profile, socket, key F9, no tray icon)
- `pnpm dev:dck <command>`: run the repository's CLI against the development cockpit
- `pnpm lint`, `pnpm typecheck`, `pnpm test`: the gate, run before every commit; only the exit code counts
- `pnpm format`: Biome formatting. `pnpm build`: build `dist`. `pnpm package`: build the `.deb` in `release/`

## Premises (they outrank any implementation taste)

1. **Light:** little idle memory, no unnecessary processes.
2. **Fast:** the hotkey shows the window with no perceptible wait; keys echo immediately.
3. **Good UX/UI:** calm, dense, keyboard first, no AI look.
4. **Portable:** Linux first; macOS and Windows arrive as new adapters without touching the core.
5. **Simple:** readable code before any optimization or abstraction.

Budgets, kept as tests or checks when measurable: key to echo within 16 ms; hotkey to visible window
under 100 ms; idle memory (shell plus daemon) under 300 MB; cold start under 2 s; a 1000-item list at
60 fps (virtualized).

## Stack and layout

Node 24, pnpm workspaces, strict TypeScript, Electron, xterm.js (DOM renderer) with node-pty, zod at the
edges, Biome, Vitest. The UI is plain TypeScript on the DOM with Vite and plain CSS over generated design
tokens (no framework). Planned and not in the code yet: Radix UI, Tailwind, a local database, an MCP server.

```
packages/core       pure domain, no I/O: ports, ipc, settings, tabs, views, i18n
packages/design     tokens.json and the CSS, terminal theme and contrast checks generated from it
packages/ui         the app: DOM, xterm, styles
packages/daemon     local process: IPC server, views, cache
packages/cli        the dck command
packages/shell      Electron: window, global shortcut, PTY host
packages/adapters   one package per technology: node-pty, node-git, gitlab, secret-tool, ...
docs/               architecture, decisions, roadmap        plans/   active plans (plans/local is git-ignored)
```

- `core` imports nothing from outside (no packages, no `node:`). Everything that touches the system is a
  port in `core/src/ports` implemented by an adapter in `packages/adapters/<name>`; an adapter never
  imports another adapter. Window, CLI and later MCP are clients of the daemon.
- No Unix assumption: paths through a library, never a fixed `~/.config`; IPC behind an interface.
- Platform-specific code lives in `shell/src/platform/<os>/` or in a per-technology adapter.
- `ui/src` and `shell/src` are grouped by feature or area with tests beside the code; only the entry points
  (`main.ts`, `app.ts`, `preload.ts`) sit at the root of `src`. A folder holds at most 12 source files
  (except `core/src/ports`) and file names are lowercase kebab case. Both are tested.
- Styles go in the feature's own file in `ui/src/styles/` and are imported in order by `styles/index.css`.

## Code standards

- No `any`. Single quotes, no semicolons (Biome). One responsibility per module and per function.
- Dependencies come in as parameters (`createX(dependencies)` returning an object); no singleton imports.
  A class only for a test fake, `DckError` and `LineDecoder`.
- Comment only the why (a non-obvious decision, a workaround, a trap, an external constraint), in one dry
  line. No comment that restates the code, no docblock on a trivial function.
- Errors: an expected failure returns `Result<T, ErrorBody>` built with `fail(errorBody('DCK-X-001', detail))`;
  `throw` only for a bug; never an empty `catch`. Logs go through the injected `Logger`, never `console`,
  and never contain a secret. Details and examples: `.claude/rules/errors-and-logging.md`.
- Validate every external input at the edge with zod. Configuration has a default for everything except a
  secret or an environment address, which fails at boot. Secrets only in the system secret store.
- Writing to an external system (Jira, GitLab, other repositories) needs the user's approval and an action
  log that allows undoing.

## Language

- English for everything that is not text shown to the end user: code, comments, logs, error details,
  docs, plans, issues, PRs and commits. Portuguese exists only as the interface translation in
  `core/src/i18n/pt-BR.ts`. A test keeps comments in English. No em dashes in text.
- Interface text goes through the translator (`i18n/en.ts` and `i18n/pt-BR.ts`, same keys and parameters in
  both, tested); never a literal string in a component. Error messages are catalog entries `error.<code>`.

## Tests

- Title `should [expected behavior] when [condition]`; body in Arrange, Act, Assert.
- Every acceptance criterion of a plan has a test or check. Mock only external dependencies (network, disk,
  clock, process); the domain is tested without mocks.
- Fixtures use neutral names (`acme/backend`, `gitlab.example.com`, `/home/ana/...`), never real hosts,
  people or companies.
- A measurable rule in this file that gets broken becomes a test in `packages/core/src/conventions.test.ts`.

## Process

- Planning is light: write or update a plan in `plans/` before anything non-trivial, implement task by
  task and tick it off. A new or reverted decision goes in `docs/decisions.md`; closing a milestone
  updates `docs/roadmap.md`. A small isolated fix is just done.
- On an ambiguity that changes visible behavior, stop and ask before going on.
- Before new code, read the matching `.claude/rules/` file and open a neighboring file of the same kind
  (another port, another adapter) to copy the real shape; the existing code outweighs memory.
- Commits: Conventional Commits in English, imperative, one logical change each (`feat:`, `fix:`,
  `docs:`, `refactor:`, `test:`, `chore:`, `ci:`), signed off with `git commit -s` (DCO). Do not add
  co-author trailers. Release versions and the changelog are generated from these messages.
- Pushing, publishing and anything that writes outside the repository needs a separate request.
- Never commit secrets, `.env` files or internal or private data (company names, hosts, tokens).

# Contributing to Dev Cockpit

Thanks for helping. This guide covers how to set up, what is expected of a change and how to send it.
By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- For a bug or a small fix, open a pull request directly.
- For a new feature or a change in behavior, **open an issue first** and wait for a go-ahead, so your time
  is not spent on something that does not fit. Large changes need a short plan in `plans/`.
- Look at [docs/decisions.md](docs/decisions.md): it explains why things are the way they are.
- Never put internal or private data (company names, hosts, URLs, tokens, usernames, screenshots or logs
  from a private system) in an issue, a pull request, a test fixture or a comment. Use neutral names such
  as `acme/backend` and `gitlab.example.com`.

## Set up

Requirements: Node 24 (`nvm use`), pnpm 9, Linux with X11 to run the app (the tests run anywhere).

```bash
pnpm install
pnpm dev                   # builds and opens a development cockpit beside any installed one
pnpm lint && pnpm typecheck && pnpm test
```

`pnpm dev` uses its own profile, socket and key (F9) and does not touch an installed Dev Cockpit.

## What a good change looks like

- It follows [CLAUDE.md](CLAUDE.md): the architecture (ports and adapters, `core` with no I/O), the error
  and logging patterns, the design system and accessibility rules. Open a neighboring file of the same
  kind and copy its real shape.
- **English everywhere** except the interface translation: code, comments, logs, docs, issues and
  commits. New interface text goes through the translator in both `i18n/en.ts` and `i18n/pt-BR.ts`.
- Comments only explain the *why*, in one dry line.
- Tests: `should [expected behavior] when [condition]`, structured Arrange, Act, Assert. Mock only external
  dependencies. Each acceptance criterion has at least one test.
- Small and focused: one logical change per commit and per pull request.
- Source folders stay small and named in kebab case; `pnpm test` enforces this and the other
  conventions in `packages/core/src/conventions.test.ts`.

Before you push, `pnpm lint`, `pnpm typecheck` and `pnpm test` must pass (their exit codes, not a grep of
the output).

## Commits and pull requests

- **Conventional Commits** in English, imperative: `feat: add toggle shortcut`, `fix: keep focus on the
  filter`, `docs: ...`, `refactor: ...`, `test: ...`, `chore: ...`. Releases and the changelog are
  generated from them, so the type matters. A breaking change adds `!` (`feat!: ...`).
- **Sign off every commit** with `git commit -s`. That adds a `Signed-off-by: Your Name <you@example.com>`
  line and means you agree to the [Developer Certificate of Origin](https://developercertificate.org/):
  you wrote the change or have the right to submit it under the project license (AGPL-3.0-only).
- The pull request title follows the same Conventional Commits format; changes are squash merged, and
  the title becomes the commit.
- Describe what changed and why, and how you tested it. Link the issue.
- Keep the pull request up to date with `main` by rebasing. A maintainer reviews, and CI must be green.

## Reporting bugs and ideas

Use the issue templates. For a bug include your Dev Cockpit version, the distribution and desktop
environment, the steps to reproduce and what you expected. For a security problem, do not open an issue:
see [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contribution is licensed under the
[GNU Affero General Public License v3.0](LICENSE), the license of the project.

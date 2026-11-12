@AGENTS.md

## Claude Code

- Personal preferences go in `CLAUDE.local.md` (git-ignored), never in this file.
- Rules for one area load on demand from `.claude/rules/` when you read or edit matching files.
- Run `pnpm lint && pnpm typecheck && pnpm test` and read the exit code before reporting a task done.

# Extensions

## Goal

Let people extend the cockpit the way they extend an editor: write a small piece, install it on their own
machine, and later share it. Not everyone uses GitLab or Jira, and everyone has their own way of working
with AI agents, so the product ships an engine and a few built-in defaults, and the rest is installed.

The work starts small, in a deliberate order, and each step must be useful on its own:

0. **The foundation** (phase 0): a manifest, contribution points, the sources an extension can come from and
   the extensions folder. No code is loaded from anywhere and no extension kind exists yet.
1. **The AI agent harness** (phase 1): the first contribution point. Rules written as files, shown to the
   agent in its instruction file and checked automatically.
2. **Rule packs** (phase 1b): the first installable extension, a folder of rules with a manifest.
3. **Connectors in an extension host** (phase 3), then **interface contributions** and a **shared index**
   (phases 4 and 5). Sketched below, not designed in detail until the earlier phases exist.

The foundation comes first because the harness must be born as a contribution of the same mechanism every
later extension uses, not as a special case to retrofit. The hard parts (the host, permissions, a stable API
for third-party code) stay in phase 3, where D5 wants them: after two real connectors.

This follows D5 (an external contract only after two real connectors) and D24 (agents without coupling to
one vendor). The decision record is D35 in `docs/decisions.md`.

## Principles

- **A rule is data in a file; the app interprets it and never knows its content.** The product delivers
  the engine, the user brings the rules.
- **Nothing is mandatory.** With no rule installed everything works as it did.
- **Small and declarative first.** A check language that grows becomes a programming language, so checks
  stay few and declarative; code only arrives in phase 3, in a dedicated extension host, with permissions the user approves.
- **Built-in and installed things use the same contracts.** The built-in examples are not special: they are
  a pack that ships with the app and goes through the same registry as an installed one.
- **The user stays in control.** Every file the tool writes outside its own folder needs approval (D7).

Background from earlier research notes, not re-verified here: guidance given before an action and checks run
after it work better together; instructions alone help little and cost context; what must always hold should
be a check, not prose.

## The model

Three layers, all driven by the same files.

| Layer | What it is | Example |
| --- | --- | --- |
| Guide | A short instruction with a scope and the reason for it | Branch name format, review rubric |
| Sensor | A declarative check run in a hook or in CI | `dck check` of a branch, a commit message, an MR description |
| Tool | A least-privilege tool exposed to an agent over MCP, read-only by default | List the rules, query the context (phase 2) |

A **gate** (writing to an external system only with approval) already exists as a rule of the project (D7).

### Where rules live

From the lowest to the highest precedence:

1. the **built-in examples** that ship with the app, all **off** by default;
2. **installed packs** (phase 1b), in the user's extensions folder;
3. the user's **global** rules, in a folder of the app's config directory;
4. the **repository's** rules, in `.dck/rules/`, which can be versioned with the team.

A rule with the same `id` in a higher source replaces the fields it declares in the lower one, so a user
changes one field (for example the branch format) without editing the original. Open question Q2 covers the
exact merge rule.

### A rule file

Markdown with a front matter that zod validates, and a body that is the instruction for the agent.

```markdown
---
id: branch-format
title: Branch names
applies: branch            # branch | commit | pr | review | code-style | any free name
paths: []                  # optional globs that scope the rule to part of a repository
why: Work is traceable from the branch name
enabled: true
check:
  - pattern: '^(feat|fix|chore)/{ticket}-[a-z0-9-]+$'
    variables:
      ticket: '[A-Z]+-[0-9]+'
    message: 'Use <type>/<TICKET>-<slug>, for example feat/ABC-12-add-login'
---
Name the branch `<type>/<TICKET>-<short-slug>`. The ticket key comes first so the branch can be traced.
```

- `why` is required, so a rule can be pruned later when nobody remembers its reason.
- `check` is a short list of declarative checks: `pattern` (a regular expression with `{variables}`),
  `maxLength`, `required` (the text must contain a match) and `forbid` (it must not). Nothing else.
- A check may set `scope: first-line` to look at the first line only, which a commit subject needs.
- `paths` is read and kept, and not used to filter yet.
- A script as a check (`check.run`) is out of scope until phase 3 and needs approval when it arrives.

### Commands (phase 1)

The harness is used from the cockpit window and from the CLI, and both call the same code in the core (the
rules workspace). Configuring is switching a rule on or off and editing its fields; the file in
`.dck/rules/` is always the complete rule, so what is in the folder is what applies.

- `dck init`: asks about each built-in example one by one, then whether to share the rules with agents
  (the block in `AGENTS.md`). It shows what it will write and asks once before writing. `--yes` takes the
  recommended answers (branch format and commit message on, sharing on); `--remove` takes the block out and
  leaves the rule files alone.
- `dck rules`: what is on, where each rule comes from and what it overrides, plus the files that are
  invalid. `dck rules enable <id>` and `disable <id>` switch a rule in the repository (`--global` in the
  user's folder).
- `dck guide <application>`: prints the full instruction of the enabled rules of that application,
  with its size in lines and estimated tokens on the error stream (characters divided by four, with no
  tokenizer dependency) and a warning above `--budget N`.
- `dck check <application> [file]`: validates the current branch (`branch`), or the text of a file or of
  the standard input (`commit`, `pr`, any other name). Silent when it passes, the failing check and its
  message when it does not.

Exit codes follow the existing sysexits convention (0 success, 64 incorrect usage, 70 internal error) and 1
for a failed check.

### The interface

- **A Harness page in the settings screen**, for the repository of the active tab, with one muted line under
  its title that says what the rules are for. Each rule is a row with its reason and a switch. An enabled rule
  shows its **fields**: the variables of its checks (for example the accepted types) and its length limit,
  edited as plain inputs, never as a regular expression. A check message may name its own fields (`{types}`,
  `{maxLength}`), so it stays true after an edit.
- **Agents.** A switch on the same page writes the rules into a marked block of `AGENTS.md`
  (`<!-- dck:start -->` to `<!-- dck:end -->`), after a confirmation, and never touches the text around it.
  The block states each rule and its checks, so an agent follows them without running anything;
  `dck guide` is for the long texts. Claude Code reads `AGENTS.md` by itself when the repository has no
  `CLAUDE.md`; when it has one that does not import it, the page says so and offers to add the `@AGENTS.md`
  line. It never creates a `CLAUDE.md`. A block that no longer matches the rules is shown as out of date.
- **The Git section of the panel** marks the branch and each commit not pushed yet that is outside a
  rule, with the failed checks in the tooltip. For a commit only the first line checks run, because the
  panel reads the subject.
- **Nothing blocks.** The cockpit shows; it installs no git hook. `dck check` exists for whoever wants to
  call it from a hook or a script of their own.

Known limits, on purpose for now: the `dck` command only exists where the app is installed, so the check
cannot run in CI until the CLI is published by itself; a custom check is still a regular expression in a
YAML front matter, the fields only cover what a check exposes as a variable or a limit.

## Phases

| Phase | Delivers | Needs |
| --- | --- | --- |
| **0. Foundation** | Manifest v1, a contribution point registry, extension sources with precedence, the extensions folder, `dck ext list`, the built-in extension | Pure `core` plus a files adapter |
| **1. Harness** | The `rules` contribution point: rule files, `.dck/`, `dck init`, `dck rules`, `dck guide`, `dck check`, the Harness page, the mark in the Git section, the block in `AGENTS.md`, built-in examples | Phase 0 |
| **1b. Packs** | `dck ext install\|enable\|disable\|remove\|dev` and packs as the first installable extension kind | Phase 1 |
| 2. Agent tools | Harness and project context as MCP tools (the old M2-T13), so an agent queries the same engine | An MCP server, planned in the roadmap |
| 3. Connectors | An **extension host** (a dedicated Node process) that loads JavaScript or TypeScript extensions written against a dck API, permissions shown and approved at install, GitLab and Jira as the two reference connectors | The provider-neutral refactor of the core ports |
| 4. Interface | Declarative contributions (panel sections, hold menu items, settings fields, themes as token overrides) drawn by the host | Phase 3 |
| 5. Sharing | A curated index in a repository (id, repository, pinned hash), then possibly a store with signing | Phase 3 |

### Phase 0 in more detail: the foundation

Three small, shared pieces, all in the pure `core` with the file access behind a port.

- **The manifest (`dck-extension.json`, version 1).** Validated by zod. `apiVersion` is an integer the app
  compares with the one it supports, and `engines.dck` is a version range. `contributes` is an object keyed by
  **contribution point**:

  ```json
  {
    "id": "acme.conventional-commits",
    "name": "Conventional commits",
    "version": "1.0.0",
    "apiVersion": 1,
    "engines": { "dck": ">=0.3.0" },
    "contributes": { "rules": "rules/" }
  }
  ```

- **The contribution point registry.** A contribution point is a name, a zod schema for what an extension
  declares under it, and a consumer that receives the validated declarations with their source. The harness
  registers `rules` in phase 1; later phases add `connectors`, `themes` and `sections`. A manifest that
  contributes to a point this version does not know is **refused with a clear message**, never half-loaded, and
  a manifest with an entry that would need code (a `run` or `main` field, permissions) is refused the same way
  until phase 3.
- **Sources and precedence.** An extension can come from four places, from the lowest to the highest
  precedence: **built-in** (shipped with the app), **installed** (the user's extensions folder), **global**
  (the user's own files in the app's config directory) and the **repository** (`.dck/`). A repository or
  global folder is treated as an implicit extension without a manifest. The registry lists what each source
  contributed and what a higher source shadowed, which is what `dck ext list` prints.
- **Lifecycle state.** Which extensions are disabled lives in the settings (a new `extensions.disabled` list,
  default empty), through the existing settings model and not in a separate file.
- **The built-in extension.** The app ships one built-in extension (empty at first, it carries the harness
  examples in phase 1) loaded through the same path, which proves that built-in and installed share a contract.

### Phase 1b in more detail: packs

A **pack** is an extension whose only contribution is `rules`, so the manifest above is already a pack.

- Installed in the user's extensions folder (`<config dir>/extensions/<id>/`), from a local folder or a git
  URL. Because a pack holds no code, installing it needs no permissions; the install shows what it contains
  and asks for approval before writing.
- `dck ext dev <folder>` links a folder under development so the author edits and uses it right away.
- The refusal rules from phase 0 apply: a pack that declares anything this version cannot run is refused.

### Later phases, sketched

- **Provider-neutral core (before phase 3).** Today about a hundred references to GitLab sit in the shell,
  the ui, the daemon and the core: `GitLabConnection` is a core port, `connections.gitlab` is fixed in the
  settings schema, `createGitLabViews` is fixed in the daemon, and the views and `HostApi` channels are
  specific to merge requests. They become a connection and a view per provider id, and Jira is built in the
  repository as the second real connector (M2-T7) on that shape.
- **Extension host (decided, D35).** The VS Code model: extensions are JavaScript or TypeScript modules written
  against an API package (`@dck/extension-api`) and loaded by **a dedicated Node process**, the extension
  host, separate from the window and from the daemon. The host talks to the rest of the product over
  JSON-RPC 2.0 (the daemon's protocol already is one), so a crash or an error in an extension does not bring
  the cockpit down. The host API provides namespaced secrets, declared settings, HTTP, a logger and a data
  folder. The built-in GitLab and Jira connectors use the same API. **Permissions are a declaration the user
  approves at install and the host API honors, not a sandbox:** an extension still runs Node code with the
  user's rights, so the docs must say plainly to install only what you trust. Running extensions written in
  other languages as plain stdio processes stays possible later, over the same protocol.
- **Licensing note.** An extension is a separate process that talks over a protocol, so it is generally not a
  derivative work of the AGPL core and its author may choose any license. This is not legal advice; state it in
  the docs and have it reviewed before relying on it.

## What becomes an extension

The rule: **core** if the product does not work without it; a **platform adapter** if it depends on the
operating system and is chosen at boot, not installed; an **extension** if a reasonable user may not have it or
may want another one. Nothing below is converted now; each conversion happens in its own phase, and the
first-party ones ship built in through the same registry as an installed extension.

| Today | Destination | Phase |
| --- | --- | --- |
| Rules of the harness and the built-in examples | Extension (built-in pack) | 1 |
| GitLab connector (adapter, connection, merge request views) | Extension (connector, built in) | 3, after the provider-neutral refactor |
| Jira (not built yet) | Extension from day one, as the second connector | 3 |
| Claude agent adapter (dormant, D26) and any other agent | Extension (agent) | 3 |
| Environment panel section (compose containers) | Extension candidate, not everyone uses Docker | 4 |
| Dark and light themes | Extension (themes, built in), more as packs | 4 |
| The hold menu's Agent category and the connection fields in settings | Contributed by the agent and connector extensions | 4 |
| Terminal (xterm, node-pty), tabs, window and dock, settings, daemon and IPC, i18n, design tokens, the mechanisms of the hold menu and of the panel | Core | stays |
| Secret store, global shortcut, process inspection, autostart, work area | Platform adapter (Keychain on macOS, `secret-tool` on Linux) | stays |

Border cases left in the core for now and reviewed in phase 4: the Git and Sessions panel sections, project
scanning and search, and system notifications.

## Acceptance criteria

| Id | Criterion | Verification |
| --- | --- | --- |
| F1 | A valid manifest loads; an invalid one is reported with its path and field and the others still load; an unknown contribution point, or an entry that needs code, is refused with a clear message | Test |
| F2 | Extensions from the four sources are found, ordered by precedence, with the shadowed ones listed, and a disabled extension contributes nothing | Test |
| F3 | The built-in extension goes through the same registry as an installed one and shows in `dck ext list` with its source | Test |
| C1 | With no rule anywhere, the app and the CLI behave as before, `dck guide` says there is nothing to show and `dck check` passes | Test |
| C2 | The user enables a built-in example and changes one field in their own file; `guide` and `check` apply the change without editing the original | Test |
| C3 | `dck check branch` exits 0 when the current branch matches, and non-zero with the failing check and its message otherwise; nothing is printed on success | Test with a fake git |
| C4 | `dck guide` prints lines and estimated tokens and warns above the budget; `dck init` shows what it will write and writes nothing without an explicit approval | Test |
| C4b | Sharing with agents only changes its own marked block in `AGENTS.md`, doing it twice changes nothing, and removing it leaves the file as it was | Test |
| C4c | On the Harness page a rule is switched on, a field is edited and the rules are shared with agents, and the Git section marks a branch outside the rule | Test, and screenshots in both themes checked against the design system |
| C5 | Precedence holds: repository over global over packs over built-in, with the shadowed rules listed | Test |
| C6 | An invalid rule file is reported with its path and field, the other rules still load, and the app does not crash | Test |
| C7 | A pack installs with `dck ext install <folder>`, shows in `dck ext list`, applies its rules, disappears on `disable` and is deleted on `remove`; a manifest with unsupported fields is refused with a clear message | Test |
| C8 | A contributor creates a pack from the guide and installs it in about 15 minutes | Manual, with a volunteer |
| C9 | Measured budgets and cold start do not regress (the window reads the rules only for the open panel and the Harness page, with a time limit on every expression) | Gate and the existing checks |

## Tasks

Phase 0, the foundation:

- [x] EXT-T1. `core`: the manifest schema (v1, zod) with `apiVersion` and `engines`, the contribution point
  registry (register a point, load manifests, hand the validated declarations to the consumer with their
  source), the refusal rules, and source precedence with shadowing. A new error domain `EXT` with its
  catalog entries (invalid manifest, unsupported contribution, incompatible version). Tests for every
  refusal and for precedence. (F1, F2) Done as pure functions in `core/src/extensions/` (`loadExtensions`, `contributionsFor`) instead of a stateful registry: the caller passes the known contribution points and the candidates, and gets a report.
- [x] EXT-T2. Ports and adapters: an `ExtensionSource` port in the core and a files adapter that reads the
  extensions folder, the global folder and `.dck/`, with the directory access passed in, plus the
  `extensions.disabled` setting through the existing settings model. (F2) The port is named `ExtensionFinder`
  because `ExtensionSource` already names the four sources; the adapter is `@dck/adapter-extension-files`. A
  global or repository folder becomes a candidate only when it holds a folder of a registered contribution
  point, so none shows up until the harness registers `rules`.
- [x] EXT-T3. The built-in extension, the `dck ext list` command (source, state, shadowed entries, translated
  through the catalogs) and `docs/extensions.md` with the manifest and contribution point reference. (F3) The built-in
  extension is data in `core/src/extensions/built-in.ts`, beside the list of known contribution points. The
  CLI finds the window's data folder with `defaultConfigDir` (or `DCK_CONFIG_DIR`) and looks for `.dck/` at
  the root of the current repository. Follow-ups after the review: the `dck` owner is reserved, the data
  folder is `dev-cockpit` on Linux and set by the window itself, and the settings store reads the file again
  before it saves, so an edit made by the CLI survives.

Phase 1, the harness (the `rules` contribution point):

- [x] EXT-T4. `core`: the rule schema, the check kinds, `{variable}` expansion, per-field replacement, and
  pure `guide` and `check` functions, plus the marked block and the file formatter. A new error domain
  `RUL`. Tests for every check kind and for precedence. (C1, C3, C5, C6)
- [x] EXT-T5. Register `rules` in the foundation; read the rule files of every source through the
  files adapter (front matter parsed there, validated in the core); a `GitContext` port (current branch) on
  the existing git adapter; the rules workspace the CLI and the window share; a timed matcher. (C3, C5)
- [x] EXT-T6. The built-in examples as data in the built-in extension: branch format, commit message, review
  rubric, MR description, all disabled, plus a test that every example is valid. (C2)
- [ ] EXT-T7. CLI: `dck init` (questions, sharing with agents, `--yes`, `--remove`), `dck rules`
  (`enable`, `disable`), `dck guide` (budget) and `dck check` with the exit codes above, translated through
  the i18n catalogs. (C2, C3, C4, C4b)
- [ ] EXT-T7b. Interface: the Harness page (switches, fields, agents) and the mark in the Git section,
  through new `HostApi` methods served by the same workspace. (C4c, C9)
- [ ] EXT-T8. `docs/harness.md`: the daily use first, then the file format, the check kinds and precedence,
  and the known limits. (C8)

Phase 1b, packs:

- [ ] EXT-T9. The extensions folder lifecycle: `dck ext install` from a folder or a git URL with an approval
  step, `enable`, `disable`, `remove` and `dev`. (C7)
- [ ] EXT-T10. A template repository for a pack, one real example pack kept in the repository, and the
  authors' guide in `docs/extensions.md`. (C8)
- [ ] EXT-T11. Close: update `docs/decisions.md` and `docs/roadmap.md`, and check the full gate. (C9)

## Decisions and open questions

Decided with the maintainer on 2026-11-12:

| Id | Question | Decision |
| --- | --- | --- |
| Q1 | Where is the global rules folder? | The app's config directory (`<config dir>/rules/`), through the same path function as the settings, never a fixed `~/.config` |
| Q2 | Field-level or whole-rule replacement when a higher source repeats an `id`? | Front matter fields are replaced per field; the `check` list and the body are replaced as a whole, so a user never gets a half-merged check |
| Q3 | Which `applies` values are built in? | `branch`, `commit`, `pr`, `review` and `code-style` get dedicated handling (for example `dck check branch` reads the current branch); any other name is a free application rendered and checked by name |
| D35 | How does extension code run (phase 3)? | In a dedicated extension host process with a JavaScript API, separate from the window (the VS Code model) |

Decided with the maintainer on 2026-11-12, after a review of the daily use (D36):

| Id | Question | Decision |
| --- | --- | --- |
| Q6 | How does the instruction reach the agent? | A marked block in `AGENTS.md` with each rule and its checks stated in it; `dck guide` for the long texts. No generated `CLAUDE.md` |
| Q7 | Where is the harness used? | In the cockpit window (the Harness page and the Git section) and in the CLI, over one shared workspace |
| Q8 | What happens when something is outside a rule? | The panel shows it. Nothing blocks and no git hook is installed |
| Q9 | How is a rule configured? | A switch and the fields of its checks (their variables and their length limit); the file written is always the complete rule |
| Q10 | What does `dck init` switch on? | It asks about each example; `--yes` takes branch format and commit message |

Still open, with a proposal:

| Id | Question | Proposal |
| --- | --- | --- |
| Q4 | How is a check target read for `pr`? | From a file or stdin in phase 1 (the description text); reading it from GitLab waits for the connectors |
| Q5 | Pack identifiers | A dotted, lowercase `owner.name` id, unique in the extensions folder; the owner prefix avoids collisions before there is an index |

## Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| The check language keeps growing | It becomes a programming language that nobody can read | Four check kinds and nothing else until phase 3; new needs become a connector or a script with approval |
| A user regular expression with catastrophic backtracking | `dck check` hangs, for example inside a git hook | Limit the pattern and input length and run the check with a time limit |
| Sharing with agents damages a hand-written instruction file | The user loses their own text | It only writes inside its own marked block and asks first |
| Rules become long and cost context on every request | The agent follows the instructions worse | Show the size and a budget warning, and keep the examples short with a reason each |
| Designing the extension API before the second connector exists | A contract that fits one provider only | Phases 1 and 1b contain no code loading; the host contract is extracted in phase 3 from GitLab and Jira |
| Extension code runs with the user's rights in its host | A malicious or buggy extension can read files or the network | Say it plainly in the docs, show the declared permissions at install, mediate secrets and settings through the host API, and add a curated index and signing in phase 5 |

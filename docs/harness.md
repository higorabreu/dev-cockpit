# The harness

The harness keeps the working rules of a repository (branch names, commit messages, a review rubric) as
**standards**: small markdown files that the app shows to code agents and checks on request. It is phase 1
of [plans/extensions.md](../plans/extensions.md), decided in D36 of [decisions.md](decisions.md), and the
first user of the `standards` contribution point described in [extensions.md](extensions.md).

Nothing is mandatory and nothing blocks: with no standard on, every command below passes or says there is
nothing to show, and the app installs no git hook.

## Daily use

The commands read and write files only. They never talk to the daemon, so they work with the window closed.
The repository is the folder that holds `.git`, found by walking up from the current directory; outside a
repository it is the current directory. Labels and questions follow the system language; the text of a
standard is printed as it was written, except that a control character or a bidirectional control in it
or in a path shows as `?`, and the detail after an error message is always in English.

The Standards page of the settings screen and the Git section of the panel offer the same through the same
code (the standards workspace in the core): a switch per standard, its fields, the sharing with agents and
a mark on a branch or a commit outside a standard. What one writes the other reads.

### Set up a repository

```
$ dck init
Branch names: The kind of work shows in the branch list and automation can rely on the name. Switch on? [Y/n]
Commit messages: The history reads as a changelog and release notes can be generated from it. Switch on? [Y/n]
Review rubric: A fixed order finds behavior problems before style remarks and makes reviews comparable. Switch on? [y/N]
Merge request description: A reviewer needs the intent and the evidence before reading the diff. Switch on? [y/N]
Share the rules with agents in AGENTS.md? [Y/n]
Files to write:
  .dck/standards/branch-format.md
  .dck/standards/commit-message.md
  AGENTS.md
Apply? [y/N] y
Done. See what is on with: dck standards
```

- It asks about each built-in example the repository does not have on yet (one on only in your own folder
  is offered too, since the block states what the repository holds), then whether to share the rules with
  agents. With nothing on in the repository there is nothing to share and it does not ask.
  When the repository has a `CLAUDE.md` that does not import `AGENTS.md`, it also offers to add the
  `@AGENTS.md` line to it.
- Enter takes the answer in capitals. `y`, `yes`, `s` and `sim` mean yes in any case; anything else is no.
- Nothing is written before the last question is answered with yes.
- A block that is already in `AGENTS.md` and current is not asked about again: it is refreshed when a
  standard was switched on in the same run.
- `dck init --yes` asks nothing and takes the default of every question: the two recommended examples
  (branch names and commit messages) on, the sharing on, and `CLAUDE.md` left alone. Running it again
  changes nothing.
- `dck init --remove` takes the block out of `AGENTS.md` after one confirmation and leaves the standards
  files alone. The text around the block is kept as it was. With `--yes` it does not ask.

Commit `.dck/standards/` and `AGENTS.md` to share the setup with the team.

### See what is on

```
$ dck standards
branch-format   branch  on   repository  overrides built-in
commit-message  commit  on   repository  overrides built-in
mr-description  pr      off  repository  overrides built-in
review-rubric   review  on   global      overrides built-in

Invalid:
  .dck/standards/team.md  Invalid standard: id: must be lowercase kebab case

AGENTS.md is out of date with the standards. Refresh it with: dck init
```

One row per standard: its id, what it applies to, whether it is on, the source that had the last word and
the sources it overrides. Then the files that could not be used, and one line when the block in `AGENTS.md`
no longer says what the standards say. The command exits with 0 even with an invalid file, because the
listing is a report.

```
$ dck standards enable mr-description
mr-description switched on in .dck/standards/mr-description.md
AGENTS.md updated with the current rules
```

`dck standards enable <id>` and `disable <id>` write the complete standard into `.dck/standards/`, or into
the user's own folder with `--global`. When `AGENTS.md` already has the block, it is refreshed in the same
command. An unknown id exits with 1, and so does a change whose file, `<id>.md`, already holds an invalid
file or another standard: that file is never overwritten. A standard switched on with `--global` stays off while a file of the
repository says it is off, because the repository has the last word.

To change a rule, edit the file that was written: it is the whole standard, so what is in the folder is
what applies. The built-in examples keep their accepted types and their length limit in fields made for
that (`variables` and `maxLength`, described below).

### Read the instruction

```
$ dck guide commit
## Commit messages

Write the first line as `<type>(<optional scope>): <summary>`, short and in the imperative, for
example `fix(cli): handle empty input`. The rules below list the types and the length. When the reason
is not obvious, explain it in the body after a blank line.

To accept other types or another length, change the fields `types` and `maxLength` of the rules.

Why: The history reads as a changelog and release notes can be generated from it

Checked automatically:
- Start with <type>(<optional scope>): <summary> with a type from feat, fix, docs, refactor, test, chore, ci, for example fix(cli): handle empty input
- Keep the first line within 72 characters
standards: 1, lines: 13, estimated tokens: 169
```

`dck guide <application>` prints the full text of every enabled standard of that application (the value of
its `applies` field) on the standard output, so it can be piped. The size goes to the error stream: the
number of standards, the lines and the tokens, estimated as characters divided by four. Above the budget
(1500 tokens, or `--budget N`) one more line warns about it. With no enabled standard for the application
it says there is nothing to show and exits with 0.

### Check a branch or a text

```
$ dck check branch
Branch names: Use <type>/<short-slug> in lowercase with a type from feat, fix, docs, refactor, test, chore, ci, for example feat/add-login
$ echo $?
1
```

- `dck check branch` checks the current branch. Outside a repository or on a detached HEAD there is nothing
  to check and it exits with 0.
- `dck check <application> <file>` checks the text of a file, and `dck check <application>` or
  `dck check <application> -` the text of the standard input: `dck check commit message.txt`,
  `dck check pr description.md`, `echo feat/add-login | dck check branch -`.
- Passing prints nothing and exits with 0. Failing prints one line per failed rule on the error stream, with
  the title of the standard and the message of the rule, and exits with 1.
- A file that cannot be read exits with 64.
- When the block in `AGENTS.md` is out of date, one line says so on the error stream. It never changes the
  exit code.

The command is there for a hook or a script of your own, for example `.git/hooks/commit-msg`:

```sh
#!/bin/sh
dck check commit "$1"
```

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success, including a passing check and a listing with invalid files |
| 1 | A failed check, an unknown standard id, a file that would be overwritten, or nothing to share |
| 64 | Incorrect usage, or an input file that cannot be read |
| 70 | A file could not be written, or it or a folder on its way is a link |

## A standard file

A standard is a markdown file with a YAML front matter between two `---` lines. The front matter is the
data the app validates; the body is the instruction for the agent. This is the file `dck init` writes for
commit messages:

```markdown
---
id: 'commit-message'
title: 'Commit messages'
applies: 'commit'
paths: []
why: 'The history reads as a changelog and release notes can be generated from it'
enabled: true
check:
  - pattern: '^(Merge .+|Revert ".+"|({types})(\([^()\s]+\))?!?: \S.*)$'
    variables:
      types: 'feat|fix|docs|refactor|test|chore|ci'
    scope: 'first-line'
    message: 'Start with <type>(<optional scope>): <summary> with a type from {types}, for example fix(cli): handle empty input'
  - maxLength: 72
    scope: 'first-line'
    message: 'Keep the first line within {maxLength} characters'
---
Write the first line as `<type>(<optional scope>): <summary>`, short and in the imperative, for
example `fix(cli): handle empty input`. The rules below list the types and the length. When the reason
is not obvious, explain it in the body after a blank line.

To accept other types or another length, change the fields `types` and `maxLength` of the rules.
```

| Field | Rule |
| --- | --- |
| `id` | Required in every file. Lowercase kebab case, up to 64 characters |
| `title` | Text, up to 100 characters |
| `applies` | What the standard is about, in lowercase kebab case: `branch`, `commit`, `pr`, `review`, `code-style` or any name of your own. It is the argument of `dck guide` and `dck check` |
| `why` | The reason for the standard, so it can be pruned when nobody remembers it |
| `enabled` | `true` or `false`. A standard that no file switches off is on; the built-in examples ship off |
| `paths` | A list of globs. Read and kept, and not used to filter yet |
| `check` | Up to 20 rules, described below. May be missing or empty: a standard can be an instruction only |

`title`, `applies` and `why` are required in the standard as a whole, not in every file: a file that
overrides another one may hold the `id` and the one field it changes. The front matter is strict, so a
field that is not in this table makes the file invalid.

### Rules

A rule has exactly one kind, a `message` and optionally a `scope` and `variables`.

| Kind | Value | The text passes when |
| --- | --- | --- |
| `pattern` | A regular expression | The expression matches. Anchor it with `^` and `$` to describe the whole text; one line break at the end of the text is left out, so `$` works on a file or a piped text |
| `required` | A regular expression | The expression matches somewhere, for a part the text must contain |
| `forbid` | A regular expression | The expression does not match anywhere |
| `maxLength` | A positive integer | The text has at most that many characters |

- An expression is a JavaScript regular expression without flags, from 1 to 500 characters. It is case
  sensitive, and `^` and `$` are the start and the end of the checked text, not of each line.
- `scope: first-line` checks the first line only, which a commit subject needs. The default, `text`, checks
  the whole text.
- `variables` names parts of the expression. `{name}` in the expression is replaced by the value of the
  variable, as a group. A name starts with a letter and holds letters and digits, so a quantifier such as
  `{1,72}` is left alone. A `{name}` with no variable makes the file invalid.
- The `message` is what a failed check prints and what the agent reads. It may name the fields of its own
  rule: `{name}` for a variable and `{maxLength}` for the limit, so it stays true after a field is edited. A
  value that is a list of alternatives (`feat|fix|docs`) is shown as `feat, fix, docs`.

Only the first 20,000 characters of a text are checked, and each expression runs with a time limit of 100
milliseconds. An expression that runs out of time counts as a failed rule, with a note, and the expressions
after it in the same check are not run: they fail the same way, so one check never waits more than one time
limit. The length limits are still checked. There is no other
rule kind and no script: code in a check waits for the extension host (phase 3).

## Sources and precedence

A standard can come from four places, from the lowest to the highest precedence:

| Source | Where |
| --- | --- |
| built-in | The examples that ship with the app: `branch-format`, `commit-message`, `review-rubric` and `mr-description`, all off |
| installed | The `standards` folder an installed extension declares in its manifest ([extensions.md](extensions.md)) |
| global | `<config directory>/standards/`, the user's own |
| repository | `.dck/standards/` at the root of the repository, which can be versioned with the team |

Every `*.md` file directly inside the folder is read, up to 200 in name order. A file that is a link, a pipe,
a device or larger than 256 KB is reported as invalid instead of read, and a folder that is a link is not
read at all. Nothing is written through a link either: when `AGENTS.md`, `CLAUDE.md`, `.dck`,
`.dck/standards` or the file itself is one, the change is refused and the command exits with 70. Files with the same `id` are layered from the lowest
source to the highest: a higher file replaces each front matter field it declares, the `check` list as a
whole, and the body when it has one. So one field can be changed without copying the original, and a rule
is never half merged. `dck standards` shows the source that had the last word and the ones it overrides.

A file that cannot be used (no front matter, an unknown field, a broken expression, a required field
missing after the merge) is reported with its path and the problem, as `DCK-STD-001`. The other standards
still load. An extension listed in the `extensions.disabled` setting contributes no standard, and that
includes the built-in examples (`dck.built-in`) and the two folders (`dck.global`, `dck.repository`).

## The block in `AGENTS.md`

Sharing writes the rules into a block the app owns, at the end of `AGENTS.md` (the file is created when it
does not exist):

```markdown
<!-- dck:start -->
## Standards to follow in this repository

- Branch names: Use <type>/<short-slug> in lowercase with a type from feat, fix, docs, refactor, test, chore, ci, for example feat/add-login
- Commit messages: Start with <type>(<optional scope>): <summary> with a type from feat, fix, docs, refactor, test, chore, ci, for example fix(cli): handle empty input; Keep the first line within 72 characters
- Review rubric: A fixed order finds behavior problems before style remarks and makes reviews comparable
  Details: `dck guide review`
<!-- dck:end -->
```

- One line per enabled standard that the repository itself holds in `.dck/standards/` (the block is
  versioned with the team, so a standard only your own folder switches on stays out of it): its title and the messages of its rules, or its reason
  when it has no rule. The rules are stated in the block, so an agent follows them without running
  anything. A standard with no rule also points to `dck guide` when it has a body, and a standard with
  rules when its body is longer than five lines.
- With no standard of the repository on there is nothing to share: no empty block is written, and the
  window or the command says so.
- The block is always in English and has the same bytes for the same standards, whatever the language of
  the system.
- Only the lines from one marker to the other are ever changed; the other lines keep their line endings.
  An end marker pairs with the nearest start marker before it, so a stray start marker never takes the text
  after it, and a start marker with no end after it is left alone (the block is then appended). Markers
  inside a fenced code block are ignored. Sharing twice changes nothing, and removing the block leaves the
  text around it as it was.
- The block is **out of date** when the lines between its markers no longer say what the standards say, for
  example after a standard file was edited by hand. The text around the block and its line endings do not
  count. `dck standards` and `dck check` say so; `dck init` and `dck standards enable` or
  `disable` refresh it.

Claude Code reads `AGENTS.md` by itself when the repository has no `CLAUDE.md`. When there is a `CLAUDE.md`,
it reads the block only if that file imports the other with a line `@AGENTS.md`; `dck init` notices the
missing line and offers to add it. The app never creates a `CLAUDE.md`, and `--yes` never changes one.

## Known limits

- Nothing enforces a standard. The app shows and `dck check` reports; a hook is the user's own.
- The `dck` command only exists where the app is installed, so the check cannot run in CI until the CLI is
  published by itself.
- A custom rule is a regular expression in a YAML front matter. The fields (`variables` and `maxLength`)
  only cover what a rule exposes.
- `pr` is checked from a file or the standard input. Reading a description from GitLab waits for the
  connectors.
- `paths` is stored and does not scope a standard yet.
- Removing the block from an `AGENTS.md` that held nothing else leaves an empty file.
- Installing a pack of standards with a command (`dck ext install`) is planned for phase 1b; until then an
  installed extension is a folder placed by hand.

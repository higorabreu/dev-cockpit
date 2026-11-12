# Extensions

The reference for the extension foundation (phase 0 of [plans/extensions.md](../plans/extensions.md),
decision D35 in [decisions.md](decisions.md)). It describes what the code does today and marks what is
planned.

## What an extension is today

An extension is a folder with a manifest, `dck-extension.json`, that declares what it contributes. It is
data: **no code from an extension is loaded or run**, and a manifest that asks for code is refused. The
app reads the manifests, validates them, decides which ones win and reports the rest.

| Shipped | Planned, not in the code |
| --- | --- |
| The manifest (version 1) and its validation | `dck ext install`, `enable`, `disable`, `remove`, `dev` (phase 1b) |
| Contribution points, with `rules` registered | Extensions with code in a dedicated host process (phase 3) |
| Four sources with precedence and shadowing | Interface contributions and a shared index (phases 4 and 5) |
| The built-in extension, with the example rules | |
| The `extensions.disabled` setting | |
| `dck ext list` | |
| The harness commands that use the rules ([harness.md](harness.md)) | |

## The manifest

```json
{
  "id": "acme.conventional-commits",
  "name": "Conventional commits",
  "version": "1.0.0",
  "description": "Commit message rules",
  "apiVersion": 1,
  "engines": { "dck": ">=0.3.0" },
  "contributes": { "rules": "rules" }
}
```

| Field | Required | Rule |
| --- | --- | --- |
| `id` | yes | `owner.name`: two parts joined by one dot, each starting with a lowercase letter and then lowercase letters, digits or hyphens; up to 100 characters |
| `name` | yes | Text, 1 to 100 characters |
| `version` | yes | `major.minor.patch`, with an optional pre-release suffix (`1.2.0-beta.1`) |
| `description` | no | Text, up to 300 characters |
| `apiVersion` | yes | A positive integer, equal to the manifest API version of the running app (today `1`) |
| `engines.dck` | yes | A version range the running app must satisfy (syntax below); `engines` takes no other key |
| `contributes` | no | An object keyed by contribution point id (a lowercase letter, then lowercase letters, digits or hyphens); defaults to `{}` |

The owner `dck` is reserved for what ships with the app: an installed extension whose `id` starts with
`dck.` is refused (`DCK-EXT-001`), so it cannot replace the built-in extension.

The manifest is strict: a field that is not in this table is an error, not ignored. The fields `run`,
`main`, `permissions` and `activationEvents` are refused with their own error (`DCK-EXT-002`), because they
would need code.

### `apiVersion` and `engines.dck`

`apiVersion` is the version of the manifest format. It must be exactly the one the app supports
(`EXTENSION_API_VERSION`, today `1`); there is no range.

`engines.dck` is a range over the app version:

- A comparator is an optional operator (`>=`, `<=`, `>`, `<`, `=`) followed by `major.minor.patch`. With no
  operator it means `=`.
- Several comparators separated by spaces must all hold: `>=0.3.0 <1.0.0`.
- Nothing else is supported: no `^`, `~`, `||`, `x` or `*`, no partial version (`>=0.3`) and no pre-release
  suffix inside the range.
- A pre-release suffix on the app version is ignored when comparing, so the app `0.3.0-beta` counts as
  `0.3.0`.

## Contribution points

A contribution point is a named place an extension can contribute to: an id plus a schema for what an
extension declares under that id in `contributes`. The loader validates each declaration with the schema of
its point and hands the valid ones to whoever consumes the point, from the lowest to the highest
precedence.

One contribution point is registered, `rules`; any other key in `contributes` is refused as unknown.
`connectors`, `themes` and `sections` are planned for later phases.

### `rules`

The declaration is the folder that holds the extension's rule files, relative to the extension and
written with forward slashes: `"rules"` or `"team/rules"`. An empty name, an absolute path, a backslash or
a `..` part is refused (`DCK-EXT-001`). Every `*.md` file directly inside the folder is one rule: a YAML
front matter between two `---` lines, validated by the app, and a markdown body. A file that cannot be read
as a rule is reported with its path and the others still load. Files with the same rule `id` are layered
from the lowest to the highest source, each replacing the fields it declares. The file format and the
commands that use the rules are in [harness.md](harness.md).

## Sources and precedence

An extension comes from one of four sources, from the lowest to the highest precedence:

| Source | Where it comes from |
| --- | --- |
| `built-in` | Shipped with the app |
| `installed` | A subfolder of `<config directory>/extensions/` that holds a `dck-extension.json` |
| `global` | The user's own files in the app's config directory |
| `repository` | The `.dck/` folder at the root of the current repository (the folder that holds `.git`); outside a repository there is none |

The config directory is `~/.config/dev-cockpit` on Linux (or under `XDG_CONFIG_HOME`),
`~/Library/Application Support/Dev Cockpit` on macOS and `%APPDATA%\\Dev Cockpit` on Windows. The window and
the CLI use the same folder; `DCK_CONFIG_DIR` overrides it.

When the same `id` comes from more than one source, the highest source wins and the others are
**shadowed**: they contribute nothing and are listed with the source that replaced them. Two extensions with
the same `id` in the same source are an error: the first by location is kept and the other is refused
(`DCK-EXT-001`).

In the extensions folder a subfolder without a manifest is skipped, and a linked folder counts as a folder.
A manifest that cannot be read or is not valid JSON is still listed, as refused.

### The built-in extension

The app ships one extension, `dck.built-in`, as data. It contributes the example rules (branch
format, commit message, review rubric and merge request description), all off until the user turns one
on. It takes the version of the running app and goes through the same loader as an installed extension:
it can be disabled or refused by the same rules.

### Implicit extensions

The global folder and a repository's `.dck/` have no manifest. Each is treated as one implicit extension,
`dck.global` and `dck.repository`, whose `contributes` lists the contribution points it has a folder for
(today only `rules`, from `<config directory>/rules/` and `.dck/rules/`). A folder that holds
nothing this version knows is not listed.

## Disabling an extension

The setting `extensions.disabled` in `settings.json` is a list of extension ids, empty by default. A
disabled extension is still loaded and listed, and contributes nothing. An entry that is not a valid id is
dropped when the settings are read, and the list holds up to 200 ids. The commands `dck ext enable` and
`dck ext disable` that will manage the list are planned (phase 1b); until then it is edited by hand. A
running window reads the file again before it saves a change, so it keeps the edit.

```json
{ "extensions": { "disabled": ["acme.conventional-commits"] } }
```

A disabled extension still shadows a lower source with the same `id`.

## What is refused

A refused extension is never half-loaded: it contributes nothing, the others still load, and it is
reported with its location, an error code and a detail.

| Code | Message | When |
| --- | --- | --- |
| `DCK-EXT-001` | Invalid extension manifest | The manifest is not a JSON object; an installed extension uses the reserved `dck` owner; a field is missing, has the wrong shape or is not known (up to three problems are named, each with its field); a declaration does not fit the schema of its contribution point; the same `id` twice in one source |
| `DCK-EXT-002` | Extension feature not supported by this version | The manifest has `run`, `main`, `permissions` or `activationEvents`; `contributes` names a contribution point this version does not know |
| `DCK-EXT-003` | Extension not compatible with this version | `apiVersion` differs from the supported one; the app version is outside `engines.dck` |

## `dck ext list`

Prints what was found, one row per extension: id, version, source and state. The rows go from the lowest to
the highest source, then the shadowed copies with the source that replaced them and their location, then
the refused ones with their location, source and reason. The labels and the error message follow the
system language; the detail after the message is always in English.

```
$ dck ext list
dck.built-in  0.2.0  built-in   active
acme.commits  1.0.0  installed  active
acme.reviews  0.4.1  installed  disabled

Rejected:
  /home/ana/.config/dev-cockpit/extensions/acme.old     installed  Extension not compatible with this version: acme.old needs dck <0.2.0, this is 0.2.0
  /home/ana/.config/dev-cockpit/extensions/acme.runner  installed  Extension feature not supported by this version: this version cannot run code: main
  /home/ana/.config/dev-cockpit/extensions/broken       installed  Invalid extension manifest: the manifest must be a JSON object
```

A shadowed copy is one more row, with the source that replaced it and its own location. No pair of today's
sources can repeat an `id` (the built-in and implicit ids are reserved), so this row only shows the format:

```
acme.commits  0.9.0  built-in  shadowed by installed  built-in
```

Control characters in a manifest or in a folder name are printed as `?`.

With nothing installed, only the built-in extension shows:

```
$ dck ext list
dck.built-in  0.2.0  built-in  active
```

A `rules/` folder in the config directory or in the repository's `.dck/` adds its implicit extension:

```
$ dck ext list
dck.built-in    0.2.0  built-in    active
dck.global      0.2.0  global      active
dck.repository  0.2.0  repository  active
```

The command reads files and never talks to the daemon. It exits with 0 even when an extension is refused,
because the listing is a report; an unknown subcommand prints `Usage: dck ext list` and exits with 64.

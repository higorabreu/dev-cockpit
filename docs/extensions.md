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
| The manifest (version 1) and its validation | Extensions with code in a dedicated host process (phase 3) |
| Contribution points as a mechanism, with one registered: `connectors` | Connectors from installed extensions (phase 3) |
| Four sources with precedence and shadowing | Interface contributions and a shared index (phases 4 and 5) |
| The built-in extensions: `dck.built-in` (empty) and `dck.gitlab` | |
| The `extensions.disabled` setting | |
| `dck ext list`, `dck ext enable`, `dck ext disable` | |

## The manifest

```json
{
  "id": "acme.conventional-commits",
  "name": "Conventional commits",
  "version": "1.0.0",
  "description": "Commit message rules",
  "apiVersion": 1,
  "engines": { "dck": ">=0.3.0" },
  "contributes": {}
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

A point can also limit the sources whose extensions may contribute to it. A declaration from another
source refuses the whole extension (`DCK-EXT-002`), with the point and the allowed sources in the detail.

One point is registered: `connectors`. Any other key in `contributes` is refused as unknown; `themes` and
`sections` are the next candidates.

### `connectors`

A connector brings the developer's work from a service (GitLab today, Jira next) into the Work screen.
Its code still ships with the app, because extensions cannot run code yet: **only built-in extensions may
declare a connector**, and a connector from an installed, global or repository extension is refused with
`DCK-EXT-002` until the extension host exists (phase 3). The contract below is internal until then and may
change with the second connector.

`contributes.connectors` is a list of 1 to 4 connectors:

```json
{
  "id": "gitlab",
  "name": "GitLab",
  "connection": {
    "address": { "placeholder": "https://gitlab.example.com" },
    "token": { "label": "connections.gitlab.token", "hint": "connections.gitlab.token.hint" }
  },
  "views": [
    { "id": "review", "kind": "mergeRequest", "title": "views.review", "empty": "views.empty.review", "badge": "views.waiting" },
    { "id": "mine", "kind": "mergeRequest", "title": "views.mine", "empty": "views.empty.mine" }
  ]
}
```

| Field | Rule |
| --- | --- |
| `id` | A lowercase letter, then up to 31 lowercase letters, digits or hyphens. It names the settings entry `connections.<id>` and the keyring key `<id>.token` |
| `name` | The product name, 1 to 60 characters, the same in every language |
| `connection.address` | Always asked; `placeholder` is shown in the empty field |
| `connection.email` | Optional; when present the account e-mail is asked too, with its `placeholder` |
| `connection.token` | Always asked; `label` and `hint` are keys of the text catalogs |
| `views` | 1 to 8 views. `id` is unique across connectors; `kind` is `mergeRequest` or `issue`; `title` and `empty` are catalog keys; `badge` is an optional plural catalog key, and the item count of that view becomes the rail badge |

Every text is a key of the text catalogs (`core/src/i18n`), checked when the declaration is read, so a
connector is translated like the rest of the interface. The declaration is strict: an unknown field is an
error.

A connector or view id that an extension loaded before already uses refuses the later extension
(`DCK-EXT-001`, with the id and its owner in the detail), so a view id always names one view.

The app finds the code of a connector by its `id`, in the window and in the daemon. An enabled connector
with no code in the app is logged and left out, never drawn half-working. What a connector has in the
product:

| Where | What |
| --- | --- |
| Settings, Connections | One section per enabled connector, with the fields it declares |
| `settings.json` | `connections.<id>` with `url` and, when declared, `email` (the token never) |
| System keyring | `<id>.token`, prefixed with the profile in development (`dev:gitlab.token`) |
| Daemon | One views service and one cache file per connector |
| Work screen | One tab per view, only while the connector's account is connected |

## Sources and precedence

An extension comes from one of four sources, from the lowest to the highest precedence:

| Source | Where it comes from |
| --- | --- |
| `built-in` | Shipped with the app |
| `installed` | A subfolder of `<config directory>/extensions/` that holds a `dck-extension.json` |
| `global` | The user's own files in the app's config directory |
| `repository` | The `.dck/` folder at the root of the current repository (the folder that holds `.git`), or of the current directory outside a repository |

The config directory is `~/.config/dev-cockpit` on Linux (or under `XDG_CONFIG_HOME`),
`~/Library/Application Support/Dev Cockpit` on macOS and `%APPDATA%\\Dev Cockpit` on Windows. The window and
the CLI use the same folder; `DCK_CONFIG_DIR` overrides it.

When the same `id` comes from more than one source, the highest source wins and the others are
**shadowed**: they contribute nothing and are listed with the source that replaced them. Two extensions with
the same `id` in the same source are an error: the first by location is kept and the other is refused
(`DCK-EXT-001`).

In the extensions folder a subfolder without a manifest is skipped, and a linked folder counts as a folder.
A manifest that cannot be read or is not valid JSON is still listed, as refused.

### The built-in extensions

The app ships its extensions as data, and each takes the version of the running app and goes through the
same loader as an installed extension: it can be disabled or refused by the same rules.

| Id | Contributes |
| --- | --- |
| `dck.built-in` | Nothing yet |
| `dck.gitlab` | The GitLab connector: merge requests waiting for your review and the ones you opened |

`dck.jira` arrives with the Jira connector (phase B of [plans/connectors.md](../plans/connectors.md)); it is
not declared before its code exists.

### Implicit extensions

The global folder and a repository's `.dck/` have no manifest. Each is treated as one implicit extension,
`dck.global` and `dck.repository`, whose `contributes` lists the contribution points it has a folder for
(for example `.dck/standards/` for `standards`). A folder that holds nothing this version knows is not
listed. `connectors` has no folder, because a connector only comes built in, so **neither shows up
today**.

## Disabling an extension

The setting `extensions.disabled` in `settings.json` is a list of extension ids, empty by default. A
disabled extension is still loaded and listed, and contributes nothing. An entry that is not a valid id is
dropped when the settings are read, and the list holds up to 200 ids.

```json
{ "extensions": { "disabled": ["dck.gitlab"] } }
```

`dck ext disable <id>` adds an id to the list and `dck ext enable <id>` takes it out. Both write
`settings.json` in the window's own format and change nothing else in it; the id must be one `dck ext list`
shows, or one already in the list (so an extension that was removed can still be enabled). A file that is
not valid JSON is left as it is and the command fails with 1. A running window watches the file and applies
the new list at once; any other field edited by hand still applies at the next start.

Disabling a connector hides its section in Connections and its tabs in the Work screen, and stops its views
in the daemon. Its address and its token stay where they are, so enabling it again finds the account still
connected. A disabled built-in connector is listed at the end of Settings, Connections, as a row with an
Enable button, which takes its extension out of `extensions.disabled` through the settings model, with no
restart. Disabling has no button: it stays in the CLI.

```
$ dck ext disable dck.gitlab
dck.gitlab disabled
$ dck ext enable dck.gitlab
dck.gitlab enabled
```

A disabled extension still shadows a lower source with the same `id`.

## What is refused

A refused extension is never half-loaded: it contributes nothing, the others still load, and it is
reported with its location, an error code and a detail.

| Code | Message | When |
| --- | --- | --- |
| `DCK-EXT-001` | Invalid extension manifest | The manifest is not a JSON object; an installed extension uses the reserved `dck` owner; a field is missing, has the wrong shape or is not known (up to three problems are named, each with its field); a declaration does not fit the schema of its contribution point; the same `id` twice in one source |
| `DCK-EXT-002` | Extension feature not supported by this version | The manifest has `run`, `main`, `permissions` or `activationEvents`; `contributes` names a contribution point this version does not know; it contributes to a point its source may not contribute to (a connector outside a built-in extension) |
| `DCK-EXT-003` | Extension not compatible with this version | `apiVersion` differs from the supported one; the app version is outside `engines.dck` |

## `dck ext list`

Prints what was found, one row per extension: id, version, source and state. The rows go from the lowest to
the highest source, then the shadowed copies with the source that replaced them and their location, then
the refused ones with their location, source and reason. The labels and the error message follow the
system language; the detail after the message is always in English.

```
$ dck ext list
dck.built-in  0.3.0  built-in   active
dck.gitlab    0.3.0  built-in   active
acme.commits  1.0.0  installed  active
acme.reviews  0.4.1  installed  disabled

Rejected:
  /home/ana/.config/dev-cockpit/extensions/acme.old      installed  Extension not compatible with this version: acme.old needs dck <0.2.0, this is 0.3.0
  /home/ana/.config/dev-cockpit/extensions/acme.runner   installed  Extension feature not supported by this version: this version cannot run code: main
  /home/ana/.config/dev-cockpit/extensions/acme.tracker  installed  Extension feature not supported by this version: acme.tracker contributes connectors, which only built-in extensions can do in this version
  /home/ana/.config/dev-cockpit/extensions/broken        installed  Invalid extension manifest: the manifest must be a JSON object
```

A shadowed copy is one more row, with the source that replaced it and its own location. No pair of today's
sources can repeat an `id` (the built-in and implicit ids are reserved), so this row only shows the format:

```
acme.commits  0.9.0  built-in  shadowed by installed  built-in
```

Control characters in a manifest or in a folder name are printed as `?`.

With nothing installed, only the built-in extensions show:

```
$ dck ext list
dck.built-in  0.3.0  built-in  active
dck.gitlab    0.3.0  built-in  active
```

The command reads files and never talks to the daemon. It exits with 0 even when an extension is refused,
because the listing is a report; an unknown subcommand prints
`Usage: dck ext list | enable <id> | disable <id>` and exits with 64, and so does `enable` or `disable`
with an id no extension has.

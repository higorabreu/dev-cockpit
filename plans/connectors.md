# Connectors: GitLab and Jira as extensions

## Goal

The Work screen shows the developer's work from the services their company uses, and nothing from the
ones it does not. GitLab stops being fixed in the product and becomes a connector, and Jira Cloud arrives
as the second connector, showing the issues assigned to the user in a **Tasks** tab.

A connector is a contribution of the extension system (`plans/extensions.md`, D35). Both connectors ship
with the app as built-in extensions (`dck.gitlab`, `dck.jira`), off until the user connects them, and a
company that does not use one can disable it with `dck ext disable`. Their code is compiled into the app:
the extension host of phase 3 does not exist yet, and the contract between a connector and the product is
extracted here, from the two real connectors, as D5 asks.

## Decisions taken with the maintainer (2026-11-13)

- Built-in connectors, no new process (the host comes later and inherits this contract).
- Jira Cloud only (an `atlassian.net` site, an e-mail and an API token); Server and Data Center later.
- The Tasks tab shows the open issues assigned to the user, read only (D7).
- The Work screen shows only the tabs of connected services; with none connected it shows "Account not
  connected" with a way to Connections.
- On a task, Enter opens it in the browser and Ctrl+C copies its key (`ACME-123`).

## Principles

- **What is not connected does not show.** No empty tabs, no Jira words for a GitLab user.
- **One shape for every connector.** The settings, the keyring key, the host channels, the daemon views
  and the Work tabs are per connector id; nothing outside a connector's own files names a service.
- **GitLab behaves exactly as today** after the refactor, settings file and keyring token included.
- **Calm rows.** A task row carries what helps choose the next task (summary, key, type, status, age),
  not everything Jira knows.

## Phase A: provider-neutral connectors

- A `connectors` contribution point. A connector declares its id, its name, the fields of its connection
  (address, optionally an account e-mail, a token with its hint) and its views (id, title key, item kind).
- `dck.gitlab` and `dck.jira` as built-in extensions carrying that declaration. A manifest from any other
  source contributing a connector is refused until the host exists, with a clear message.
- The implementation of a built-in connector is found by its id in the app (shell and daemon), so an
  enabled declaration without an implementation is reported, never half-loaded.
- Settings: `connections.<id>` with the non-secret fields; the current `connections.gitlab.url` stays where
  it is. Keyring key `<id>.token` with the profile prefix (`gitlab.token` stays the same).
- Host API and channels per connector id (`connections.status(id)`, `connect(id, fields, token)`,
  `disconnect(id)`); views per view id with a snapshot whose items are a union by kind
  (`mergeRequest`, `issue`).
- The daemon runs one views service per connected connector, each with its own cache file.
- Settings, Connections page: one section per enabled connector, drawn from its declared fields.
- Work screen: tabs from the views of connected connectors; the rail badge stays the number of merge
  requests waiting for review.

## Phase B: Jira Cloud

- Adapter `@dck/adapter-jira`: `GET /rest/api/3/myself` and `GET /rest/api/3/search/jql` with
  `assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC`, only the fields used
  (`summary`, `status`, `issuetype`, `project`, `updated`), 100 per page with `nextPageToken`, at most
  10 pages. Basic authentication with the e-mail and the API token. Error domain `JRA`.
- Connection: Address (`https://acme.atlassian.net`), E-mail, API token, with the hint "Create it at
  id.atlassian.com, under Security, API tokens. Kept in the system keyring, never in a file."
- Tasks tab: row line 1 the summary; line 2 the key in the reference style, the type and the age; on the
  right a neutral status chip with the category glyph (ring for to do, dot for in progress). The filter
  matches key, summary, type and status; the "Needs attention" button is hidden on this tab. Ctrl+C copies
  the key and shows the existing "copied" notice; the hint bar shows it.
- Empty text: "No open tasks assigned to you."

## Acceptance criteria

| Id | Criterion | Verification |
| --- | --- | --- |
| K1 | With GitLab connected and Jira not, the Settings page, the Work screen, the rail badge, the settings file and the keyring key look and behave as before the change | The existing tests, screenshots |
| K2 | A connector disabled with `dck ext disable` disappears from Connections and from the Work tabs; enabling it brings it back connected | Test |
| K3 | A connector contributed by an installed or repository extension is refused with a clear message in `dck ext list` | Test |
| K4 | Jira connects with an address, an e-mail and a token; a wrong token, a wrong address, a site that is not Jira and no network each show their own message | Tests with a fake HTTP client |
| K5 | The Tasks tab lists the open issues assigned to the user, most recently updated first, and Enter opens one in the browser | Test, and a run against a fake Jira server |
| K6 | Ctrl+C on a task copies its key and shows the copied notice | Test |
| K7 | With only Jira connected the Work screen shows only Tasks; with nothing connected it shows the setup notice | Test, screenshots |
| K8 | The token never reaches a file, a log or a process argument | Test |
| K9 | The Connections page and the Tasks tab follow the design system in both themes and both languages, by keyboard and with a screen reader | Screenshots and tests |

## Tasks

- [x] CN-T1. `core`: the `connectors` contribution point, the two built-in connector extensions, refusal
  of connectors from other sources, the per-id connection and views ports, the view item union. (K2, K3)
  Only `dck.gitlab` is declared: `dck.jira` arrives with its code in CN-T4, so no enabled declaration ships
  without an implementation. A contribution point can limit its sources; `connectors` allows only built-in.
  A view also declares its empty text and, for one view, the rail badge, so the interface names no view id.
- [x] CN-T2. Shell, daemon, host API and CLI move to connector ids; GitLab unchanged. (K1, K8) `dck ext
  enable|disable` did not exist, so it was added for K2, and the window watches `settings.json` to apply
  `extensions.disabled` at once. GitLab keeps `views-cache.json`, and an old cache loads as merge
  requests. A malformed connect request now answers `DCK-IPC-003` instead of GitLab's address error.
- [x] CN-T3. Interface: Connections page and Work tabs drawn from the connected connectors, screenshots
  in both themes and languages. (K1, K7, K9) Connections lists the disabled connectors with an Enable
  button. With nothing connected the Work screen shows only its title, the notice and the close button,
  with the focus on "Open Connections". Focus stays put while an account is checked and lands on
  Disconnect, the token field or the address after connect, a failure or disconnect. A view id that
  another loaded connector uses refuses the later extension.
- [x] CN-T4. `@dck/adapter-jira`, its schemas and error codes, and the Jira connection. (K4, K8)
  `DCK-JRA-001` to `008`: refused credentials, no permission, address not found, rate limited, not
  responding, not Jira, invalid address, invalid e-mail. The last two are checked before any request.
- [x] CN-T5. The Tasks tab: row, filter, Ctrl+C, empty text, both catalogs, screenshots. (K5, K6, K9)
- [x] CN-T6. Docs: `docs/extensions.md` (the `connectors` point), the roadmap (milestone 2), D41. Phase A
  part done (the `connectors` point, `dck ext enable|disable`, D41); phase B added `dck.jira` to the
  extensions reference, the roadmap and the architecture.

## Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| The refactor changes GitLab behaviour | A regression for the only current user | Phase A ships alone, with GitLab's tests unchanged and screenshots before and after |
| Atlassian changes the search API (the old `/search` was retired in 2025) | Tasks stop loading | One adapter file; the error shows in the tab with what was stored |
| The contract fits two connectors and not the third | A rework when the host arrives | It is kept internal until phase 3 and not published as an API |

## Results

Phase B (2026-11-13). Jira Cloud fitted the phase A contract with no change to it: a declaration, an
adapter, a connection in the window and a views service in the daemon, and the Work screen drew a second
item kind.

- The search uses `GET /rest/api/3/search/jql` with `nextPageToken`; finished issues are left out even if
  one slips past the query, and the update date is stored as ISO because Jira writes `+0000`.
- The address keeps only the site root, so a pasted board or issue link connects; an e-mail that is not an
  address is refused before any request (`DCK-JRA-008`). The e-mail is never logged.
- "Connected as" shows the display name, since Jira Cloud has no username. Disconnecting erases the address,
  the e-mail and the token; the settings model drops an empty e-mail, which is how it is erased.
- The status is plain text with its category glyph, not a chip: in the MR tab a bordered chip means
  something needs the user, and a status does not. In progress reads in the text color with a dot and to do
  in the muted color with a ring. A long status is cut at 160 px with its tooltip. A merge request's Draft
  chip keeps its outline on a highlighted row, where the line color vanished in the light theme.
- Ctrl+C copies the key only on Tasks and only when no text is selected in the filter; a click on the key is
  the mouse path, with its tooltip and shortcut. The Work header says "Copied ACME-139" for two seconds in
  place of the update time, through its status element, instead of the tab bar's notice.
- The hint bar leaves out switching tabs when there is only one.
- Verified against a fake Jira server (two pages, 12 issues) in both themes and languages, with GitLab and
  Jira together, Jira alone, an empty list, a wrong token and a narrow window.

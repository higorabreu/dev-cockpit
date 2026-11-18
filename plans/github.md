# GitHub: pull requests in the Work screen

**Status:** Done, shipped in 0.9.0 (D57).

## Goal

A developer whose company uses GitHub sees, in the Work screen, the pull requests waiting for their
review and the ones they opened, the way GitLab shows merge requests. GitHub arrives as the third built-in
connector, `dck.github`, off until the user connects it, and a company that does not use it can disable it
with `dck ext disable dck.github`. The connector contract of `plans/connectors.md` (D41) is used as it is.

## Decisions

- **Shape.** The GitLab connector is the model: a declaration in `core`, an adapter
  `@dck/adapter-github` implementing `CodeReviewSource`, a connection in the window and a views service
  in the daemon. Pull requests are `mergeRequest` items, so the Work rows, the filter and "Needs
  attention" work unchanged.
- **Views.** "To review" (`github-review`) and "Follow up" (`github-mine`). A view id is unique across
  connectors, so GitHub cannot reuse GitLab's `review` and `mine`; the titles reuse the same catalog keys.
- **Address.** Empty means `https://github.com`; a GitHub Enterprise Server address is its web root
  (`https://github.example.com`). The API is `https://api.github.com` for github.com and `<address>/api/v3`
  otherwise. A pasted repository or pull request link keeps only the root, as Jira does, and a pasted
  `api.github.com` or `/api/v3` address reads as its web root.
- **API.** REST, read only, with the token as `Authorization: Bearer`, `Accept: application/vnd.github+json`
  and `X-GitHub-Api-Version: 2022-11-28`.
  - `GET /user` checks the token and gives the login.
  - `GET /search/issues` with `is:pr is:open archived:false review-requested:<login>` (or
    `author:<login>`), most recently updated first, 100 per page following the `Link` header, at most
    5 pages. `review-requested` also matches a request made to one of the user's teams. The login is
    used rather than `@me`, which older Enterprise servers may not know.
  - Per pull request, 5 at a time: `GET /repos/{repo}/pulls/{n}` for the branches and conflicts, then
    `GET /repos/{repo}/commits/{sha}/check-runs` and `GET /repos/{repo}/commits/{sha}/status` for the CI
    state. A lookup that fails leaves that row's branch empty or its CI `unknown`, never the list.
- **Rate limits.** The client reads `x-ratelimit-remaining`, `x-ratelimit-reset`,
  `x-ratelimit-resource` and `retry-after`. A 403 or 429 that is a rate limit (no requests left, a
  `retry-after`, or a secondary limit message) fails with its own code and blocks that resource until
  the reset (60 s without one); a blocked resource is not called again before then. The per-row lookups
  stop while fewer than 100 core requests are left. The gate lives as long as the daemon's views service,
  so a refresh after a limit does not hammer the server.
- **What does not translate from GitLab.** Open discussions: the REST API has no review thread
  resolution (only GraphQL does, and the HTTP port is read only `GET`), so it is always false. A review
  request disappears once the user submits a review, which is how GitHub records it. The reference is
  `acme/backend#12`, so a merge request item now carries its reference mark (`!` or `#`); a cached item
  without it reads as `!`.
- **Rail badge.** It counts the connected views that declare a badge. With one connected it keeps that
  view's text (GitLab alone is unchanged); with GitLab and GitHub both connected it sums them and says
  "waiting for your review" without naming the kind.
- **Order.** Built-in extensions load by id, so `dck.github` comes before `dck.gitlab`. Settings,
  Connections lists the connectors with an account (an address in the settings, connected or failing)
  first and then the others, each group in that order (`connectedFirst` in `core`), decided when the
  page loads so a section does not jump while it is connected. The Work screen only draws connected
  services, in the same order. A user with only GitLab sees GitLab first and GitHub below it.
- **CI words.** Each service's own term: a connector may declare `ciTerm` (`pipeline` when absent), and
  GitHub declares `checks`, so its rows say "Checks failed", "Checks running", "Checks queued" and
  "Checks canceled" ("Checks com falha", "Checks em execução", "Checks na fila", "Checks cancelados")
  while GitLab's keep "Pipeline". The term comes from the connector of the open tab, not from the item.
- **Token.** Fine-grained first, read only. What each call needs, from GitHub's REST reference:

  | Call | Fine-grained token | Classic token |
  | --- | --- | --- |
  | `GET /user` | No permission | No scope |
  | `GET /search/issues` | No permission; it lists only what the token can read | No scope; `repo` to see private repositories |
  | `GET /repos/{r}/pulls/{n}` | Pull requests: Read (or Contents: Read) | `repo` on a private repository |
  | `GET /repos/{r}/commits/{sha}/status` | Commit statuses: Read | `repo` on a private repository |
  | `GET /repos/{r}/commits/{sha}/check-runs` | Not available: only GitHub App tokens read check runs (Checks: Read), and a fine-grained token reads them only on public repositories | `repo` on a private repository |

  Metadata: Read is the repository permission every fine-grained token carries with the others. With a
  fine-grained token on a private repository the check runs answer 403, so a row shows the state of its
  commit statuses when there are any, and no CI chip otherwise; the list still loads. The hint is one
  line, "Fine-grained, read only. Kept in the system keyring, never in a file.", and a "Permissions"
  disclosure under it lists Pull requests, Commit statuses and Metadata read only, then the classic `repo`
  scope for private repositories, the only kind that reads their checks. Sources:
  - https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
  - https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests
  - https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request
  - https://docs.github.com/en/rest/commits/statuses#get-the-combined-status-for-a-specific-reference
  - https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference
  - https://docs.github.com/en/rest/users/users#get-the-authenticated-user
  - https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
- **Work header with three services.** The header holds only the tabs and the close button: the update
  time moves to the hint bar beside Refresh. When the tabs do not fit, measured on the real width with a
  `ResizeObserver`, the service names hide, the line between groups stays and each tab's tooltip says
  "GitHub · Pull requests waiting for your review" (its accessible name already starts with the service).
  Past that the strip scrolls sideways (the `scroll` class, the wheel turns it, the edge with tabs out of
  sight fades as on the terminal's tab bar) and keeps the active tab in view. The hint bar keeps one line the same way: navigate, then switch view, then open, then copy key
  give way; the update time and Refresh stay.
- **Errors.** Domain `GHB`, `DCK-GHB-001` to `007`, as GitLab's: refused token, no permission, not
  found, rate limited, not responding, not GitHub, invalid address. No network stays `DCK-NET-001`.
- **Secrets.** The token lives only in the system keyring as `github.token` (`dev:github.token` in
  development), read on every fetch, never in settings, logs or process arguments.

## Acceptance criteria

| Id | Criterion | Verification |
| --- | --- | --- |
| G1 | GitHub connects with an empty address (github.com) or an Enterprise address and a token; the token goes to the keyring only | Tests with a fake HTTP client and a memory keyring |
| G2 | A refused token, no permission, a wrong address, a rate limit, a server that is not GitHub, an invalid address and no network each show their own message in both languages | Tests, catalogs |
| G3 | "To review" lists the open pull requests requesting the user's review, "Follow up" the user's own, most recently updated first, with repository, number, author, branch, update time, draft, conflicts and CI state | Tests, a run against a fake GitHub server |
| G4 | A rate limited resource is not called again before its reset, and the row lookups stop near the limit | Tests |
| G5 | GitLab alone looks and behaves as before, the rail badge included | Existing tests |
| G6 | `dck ext list` shows `dck.github`; disabling it hides its section and tabs | Tests |
| G7 | Settings and the Work screen follow the design system in both themes and both languages | Screenshots |
| G8 | GitHub rows say checks and GitLab rows say pipeline, in both languages | Tests, screenshots |
| G9 | In Settings, Connections, a connector with an account comes before one without, each group in the declared order | Tests, screenshots |
| G10 | With GitHub, GitLab and Jira connected, the Work header and hint bar stay on one line from 1400 to 520 px wide, with no clipped text | Tests, screenshots |
| G11 | The GitHub token hint is one line, and its permissions unfold in place under a "Permissions" button operable by keyboard | Tests, screenshots |

## Tasks

- [x] GH-T1. `core`: the `dck.github` declaration, the address parsing, the reference mark on merge
  request items, the `GHB` codes and the catalog texts. (G1, G2, G5, G6)
- [x] GH-T2. `@dck/adapter-github`: client, schemas, rate gate, tests with a fake HTTP client. (G2, G3, G4)
- [x] GH-T3. Window and daemon: the connection (shared with GitLab's code), the views service with its
  own cache file. (G1, G3)
- [x] GH-T4. Interface: the `#` reference, the badge over several services. (G3, G5)
- [x] GH-T5. Docs: D57, README, roadmap, extensions reference. A run against a fake GitHub server with
  screenshots in both themes and languages. (G7)

## Results

- Verified against a fake GitHub Enterprise server on the local machine (two search pages, 9 pull
  requests in three repositories) in both themes and languages: connecting with a wrong token, then the
  right one, the address and the keyring entry written, both tabs with branches, drafts, conflicts and the
  CI states, the rail badge text, and a rate limited search showing "GitHub rate limited the requests".
- Every request carried the bearer token, the API version and `application/vnd.github+json`; the per-row
  lookups ran 5 at a time.
- After review (2026-11-17): GitHub rows say checks and GitLab rows pipeline, the hint asks for a
  read-only fine-grained token, and Connections lists GitLab above GitHub for a user with only GitLab
  (GitHub, GitLab, Jira with both connected). Checked with GitLab and GitHub fake servers together in both
  themes and languages.
- After the maintainer looked at the screens: with the three fakes together, the header kept its height
  from 1400 to 520 px in both languages; the service names hid at 640 px and the strip scrolled at 520 px,
  bringing Tasks into view by keyboard and the first tab back by mouse; the Permissions button opened by
  Enter and kept the focus.
- Not verified against the real github.com or a real Enterprise server; older Enterprise servers that do not
  know `X-GitHub-Api-Version` or the `Bearer` scheme for a classic token are the open risk.

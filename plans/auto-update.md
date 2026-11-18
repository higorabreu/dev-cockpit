# Updates from GitHub releases

Today a new version means downloading the `.deb` from the Releases page, checking it and installing it by
hand. The maintainer asked for opt-in updates from the project's own GitHub releases (2026-11-18).

Decided with the maintainer:

- The setting `system.updates`: `off` (the default), `notify` or `install`, a row in Settings > System with
  a "Check now" button beside it (disabled while off) that says the result in a short line ("Up to date",
  "Version X available").
- `off`: the cockpit never contacts GitHub. `notify` and `install` check at start and every 12 hours, only
  stable releases (no drafts or prereleases), comparing versions by semver. No token and no user data: the
  public `releases/latest` endpoint with a `dev-cockpit/<version>` User-Agent.
- `notify`: a discreet notice at the end of the tab bar (`#notice`, which takes its own spot and covers no
  tab) reading "Version 0.10.0 available" with "Update" and "What's new" (the release page in the browser).
  Dismissing it hides it until a newer version. While an update is available the hold menu's System list
  has an item for it.
- `install`, or "Update": on Linux the `.deb` for the running architecture is downloaded to a temporary
  folder, its SHA-256 checked against the release's `SHA256SUMS` (a mismatch is refused and said), installed
  with `pkexec apt-get install -y` (a cancelled password dialog is an expected outcome), then the notice
  reads "Updated to 0.10.0" with "Restart". Never restarted without the user; if not restarted, the new
  version runs on the next start. With an agent running in a tab, "Restart" asks inline first. A restart
  saves the tabs, then `app.relaunch()` and a clean quit.
- Errors (network, checksum, install refused) end in a short notice and a `logger.warn`, never a crash.
- Mac and Windows: the notice with "What's new" only; the Mac build is signed ad hoc and cannot replace
  itself.
- Release workflow: a job builds the Mac image on a macOS runner and attaches the `.dmg` to the same
  release, listed in `SHA256SUMS`.

## Design

- Core, no I/O: `updates/semver.ts` (semver parse and compare), `updates/release-files.ts` (the package
  name for an architecture, the `SHA256SUMS` parser) and `updates/updater.ts` (the state machine: checks,
  the 12 hour timer, dismissal, download, verify, install), over two ports in `ports/updates.ts`:
  `ReleaseSource` (the newest release) and `UpdateInstaller` (fetch a text, download with a SHA-256,
  install, discard). The checksum comparison lives in core, so it is tested without mocks.
- Adapter: `createGitHubReleaseSource` in `@dck/adapter-github`, over the shared `HttpClient`, validating
  the answer with zod.
- Shell: `platform/linux/deb-installer.ts` (download to `mkdtemp`, hash while writing, `pkexec`), and
  `updates/` for the dismissed version file and the IPC channels (no channel takes an argument: the host
  knows the release, its page and its files).
- Window: `ui/src/updates/` for the notice and the restart guard; the System row in the settings view.
  `ui/src/tabs/notice.ts` keeps a lasting notice under the short "Copied" one, so a copy no longer wipes
  the update.

**Test-only override:** with `DCK_UPDATE_FEED=<base URL>` and an app that is not packaged
(`app.isPackaged` false), the release source reads `<base URL>/repos/higorabreu/dev-cockpit/releases/latest`
instead of `https://api.github.com`, and the installer is offered even outside `/opt/dev-cockpit`. A
packaged app ignores the variable. `pkexec` is found on `PATH`, so a check puts a stub first on `PATH`.

## Tasks

- [x] U1. Core: semver compare, package name per architecture, `SHA256SUMS` parser and the `ReleaseSource`
  and `UpdateInstaller` ports, with tests.
- [x] U2. Adapter: the latest GitHub release with zod, skipping drafts and prereleases, with tests.
- [x] U3. Core: the updater state machine (modes, 12 hour timer, dismissal, install steps, failures) with a
  fake source, installer and scheduler; error codes `DCK-UPD-*` with catalog texts.
- [x] U4. Shell: the Linux installer (download, hash, pkexec, cancelled dialog) with a faked fetch and
  executor.
- [x] U5. Setting `system.updates`, host API channels, the dismissed version file, wiring in `main.ts`
  (start check, restart with saved tabs, the test-only override).
- [x] U6. Window: the notice (available, downloading, installing, installed, failed, agent warning), the
  hold menu item, the System row with "Check now"; texts in both catalogs.
- [x] U7. Release workflow: the Mac image job, the `.dmg` in `SHA256SUMS`; YAML checked, not run.
- [x] U8. D71, README, a check in the real app under Xvfb against a local fake feed (both themes, both
  languages).

## Results

Checked in the built app under Xvfb against a local feed (a fake 3 MB package served slowly) with a stub
`pkexec` on `PATH`, dark and light, English and Portuguese: off makes no request in six seconds and keeps
Check now disabled; notify and install say what they do, and Check now answers "Version 0.10.0 available"
or "Up to date"; the notice goes through available, downloading with its percent, installing and
"Updated to 0.10.0"; Restart with a process named `claude` running asks inline; a wrong checksum is
refused with its notice; a dismissed password dialog (exit 126) offers the update again; the hold menu's
System list ends with "Update to 0.10.0"; ten tabs keep their place with the notice shown. Requests carry
only `dev-cockpit/0.9.0` as User-Agent and no token. A real relaunch, outside Playwright (which kills its
process group), opened the restarted cockpit with the tab back in its folder.

Not checked: the release workflow's Mac job (it runs only on a release), a real `pkexec` install of a real
package, and a Mac.

# Install from npm

**Status:** Done, in the 0.11.0 release (D76); the package reaches npm once the repository variable `NPM_PUBLISH` is `true`.

Installing meant downloading the `.deb` from the Releases page, checking it and installing it by hand. The
maintainer asked for a command line install like the Claude Code CLI's (2026-11-18):

```
npx @devcockpit/install
```

Decided with the maintainer:

- The npm package is a small installer, not the app. It downloads the right file of the latest stable
  release of `higorabreu/dev-cockpit`, checks it against the release's `SHA256SUMS` and installs it, so the
  result is the manual install's: app menu entry, `dck` command, global key and the opt-in updates of D71.
- Debian and Ubuntu (x64, arm64): the `.deb`, downloaded to a fresh private temporary folder and installed
  with `sudo apt install -y`, after one line saying sudo may ask for the password. Other Linux systems (no
  `apt` or `dpkg-query`): a clear message with the Releases page, exit 1.
- macOS on Apple Silicon: the `.dmg`, mounted with `hdiutil attach -nobrowse -readonly`, the app copied to
  `/Applications` (the old one replaced only after the new one verified), detached, and `dck` linked into a
  writable folder of the PATH or the one line to do it printed. Intel Mac and Windows: "not available yet".
- Options: `--version <x.y.z>`, `--help`, and `--download-only` (stop after the checksum and keep the
  file, for a check without installing). Already installed at the same version: says so and exits 0.
- A few calm English lines; no colors, spinners or emoji.

## Design

- `packages/install` (`@devcockpit/install`, public, AGPL-3.0-only): `src/main.ts` wires Node's
  `fetch`, `child_process`, `fs` and `process` into the logic, which takes them as parameters:
  `installer.ts` (the flow), `apt.ts` and `mac.ts` (one `InstallTarget` each), `system.ts` (which target
  for `process.platform` and `process.arch`), `args.ts`, `node-system.ts` (the real runner and files).
- Reused, not copied: `releaseFiles`, `parseChecksums`, `debPackageName`, the new `macImageName` and semver
  from `core/src/updates`; `createGitHubReleaseSource` (with a new `tagged(version)` for `--version`) and
  the release download moved from the shell's `deb-installer.ts` into `@dck/adapter-node-fetch` as
  `createReleaseDownload`, now shared by the updater and the installer.
- Errors: `DCK-INS-001` to `006` (no installer for this system, GitHub unreadable, release not found,
  download failed, corrupted download, installation failed) and `DCK-UPD-003` (no package for this system)
  reused. The failure line names the code and the Releases page; exit 1, usage 64.
- Bundle: esbuild into one `dist/install.mjs` for Node 18 (the engines field), no runtime dependencies,
  not minified so it can be read before it runs with sudo. About 870 kB, 160 kB packed, most of it zod,
  which the adapters use to check GitHub's answer. `files` ships only the bundle; npm adds README,
  LICENSE (copied from the root by the build) and package.json.
- Version: `packages/install/package.json` is in release-please's extra files, so it bumps with the app.
- Release workflow: `publish-npm` runs after `publish` attached the packages, only when the repository
  variable `NPM_PUBLISH` is `true`. `pnpm pack` builds and rewrites the workspace versions, then
  `npm publish --provenance --access public` with npm trusted publishing (OIDC, `id-token: write`), so no
  npm token is stored. A version already on npm is skipped, so a rerun does not fail.

## One-time steps for the maintainer

1. Create the `devcockpit` organization on npmjs.com (free, for public packages) with your npm account.
2. First publish by hand, since npm configures a trusted publisher on a package that exists:
   `cd packages/install && pnpm pack && npm publish devcockpit-install-<version>.tgz --access public`
   (logged in with `npm login`; no `--provenance` outside CI).
3. On npmjs.com, the package's Settings > Trusted publishing: GitHub Actions, organization or user
   `higorabreu`, repository `dev-cockpit`, workflow file `release.yml`, no environment. Then, in the same
   settings, choose to require two-factor authentication and disallow tokens, if wanted.
4. In the GitHub repository, Settings > Secrets and variables > Actions > Variables: `NPM_PUBLISH` =
   `true`. From the next release on, the job publishes the installer with the app's version.

## Tasks

- [x] N1. Move the release download (fetch, hash while writing, private folder, discard) from the shell's
  `deb-installer.ts` into `@dck/adapter-node-fetch`; the updater uses it unchanged.
- [x] N2. `createGitHubReleaseSource().tagged(version)`, and links parsed without `URL.parse` (not in Node 18).
- [x] N3. Core: `releaseFiles` by package name and `macImageName`.
- [x] N4. `packages/install`: arguments, system choice, flow, apt and Mac targets with fakes; `DCK-INS-*`
  codes in both catalogs; the esbuild bundle; README; release-please extra file.
- [x] N5. Release workflow job `publish-npm`, guarded by `NPM_PUBLISH`; YAML checked, not run.
- [x] N6. README Install section, D76, this plan.
- [x] N7. Real run of the bundle in a Linux container with `--download-only` against releases v0.10.0 and
  v0.9.0: download and checksum work; `npm pack --dry-run` lists only the bundle, README, LICENSE and
  package.json; `npx ./devcockpit-install-0.10.0.tgz --help` runs.

## Results

- `--download-only` downloaded `dev-cockpit_0.10.0_amd64.deb` (88 MB) and checked it against
  `SHA256SUMS`; `sha256sum` by hand gave the same hash. `--version 0.9.0` did the same for 0.9.0,
  `--version 0.0.1` failed with `DCK-INS-003`, and a PATH without apt failed with `DCK-INS-001`.
- Not run: `sudo apt install` (no root changes in the container), the Mac path (no Mac, and v0.10.0 has no
  `.dmg` attached), the bundle on Node 18 (the code avoids newer APIs; checked by reading), and the
  workflow job.

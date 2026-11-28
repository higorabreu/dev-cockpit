# @devcockpit/install

Installs [Dev Cockpit](https://github.com/higorabreu/dev-cockpit), a Guake-style terminal cockpit for
developers, from the command line:

```
npx @devcockpit/install
```

This package is only the installer. It reads the latest stable release of `higorabreu/dev-cockpit` on
GitHub, downloads the file for your system, checks it against the release's `SHA256SUMS` and installs it,
so the result is the same as the manual install: the app menu entry, the `dck` command, the global key and
the optional updates.

- **Debian and Ubuntu** (x86-64 and arm64): installs the `.deb` with `sudo apt install`, which asks for your
  password.
- **macOS on Apple Silicon**: copies `Dev Cockpit.app` from the release's `.dmg` to `/Applications` and links
  the `dck` command into a writable folder of your `PATH` (or prints the one line to do it).
- **Windows 10 and 11** (x64, and ARM under emulation): unpacks the release's zip to
  `%LOCALAPPDATA%\Programs\Dev Cockpit` with no administrator rights, closes a running cockpit before
  replacing it, adds a Start menu entry and puts the `dck` command on your user `PATH` (open a new terminal
  to use it). The app is unsigned.
- Other Linux distributions and Intel Macs: not available yet; see the
  [Releases](https://github.com/higorabreu/dev-cockpit/releases) page.

Options:

- `--version <x.y.z>`: install this release instead of the latest.
- `--download-only`: download and check the file, print where it is and install nothing.
- `--help`: show the options.

It needs Node 18 or newer and has no dependencies. It sends no data about you: the requests to GitHub carry
only the installer's version in the User-Agent.

License: AGPL-3.0-only.

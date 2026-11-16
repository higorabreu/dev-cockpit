// Pieces of the macOS bundle that do not need macOS to build, so a test on Linux can check them

// Contents/Resources/bin/dck: runs the CLI inside the packaged Electron; link it into the PATH with ln -s.
// macOS 12 has no realpath command, so the links are followed one at a time with readlink
export function dckWrapper(product) {
  return `#!/bin/sh
self=$0
while [ -L "$self" ]; do
  link=$(readlink "$self")
  case $link in
    /*) self=$link ;;
    *) self=$(dirname "$self")/$link ;;
  esac
done
here=$(cd -P "$(dirname "$self")" && pwd)
exec env ELECTRON_RUN_AS_NODE=1 DCK_PACKAGED=1 "$here/../../MacOS/${product}" "$here/../dck.mjs" "$@"
`
}

// CFBundleShortVersionString and CFBundleVersion take only up to three integers, so a prerelease
// (1.2.0-beta.3) or build metadata keeps just its number; the full version stays in package.json
export function bundleVersion(version) {
  const [release = ''] = version.split(/[-+]/)
  if (!/^\d+(\.\d+){0,2}$/.test(release)) {
    throw new Error(`version ${version} has no x.y.z for the bundle`)
  }
  return release
}

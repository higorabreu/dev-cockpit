// Builds the Dev Cockpit .deb package from the already built `dist` (`pnpm --filter @dck/shell build`):
// copies the Electron the project already uses, puts the app in resources/app, packs the `dck` CLI and calls the
// system dpkg-deb. No extra packaging tool and no network.
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  buildCli,
  electronDist,
  NAME,
  release,
  shell,
  stageApp,
  version,
} from './package-common.mjs'

const architecture = { x64: 'amd64', arm64: 'arm64' }[process.arch]
if (!architecture) throw new Error(`arquitetura sem suporte: ${process.arch}`)

const INSTALL = `opt/${NAME}`
const stage = join(release, 'stage')
const root = join(stage, INSTALL)

rmSync(stage, { recursive: true, force: true })
mkdirSync(root, { recursive: true })

// 1. The Electron already installed in the project, with the binary renamed and only the used locales
cpSync(electronDist(), root, { recursive: true, dereference: true })
renameSync(join(root, 'electron'), join(root, NAME))
rmSync(join(root, 'resources', 'default_app.asar'), { force: true })
for (const file of readdirSync(join(root, 'locales'))) {
  if (!['en-US.pak', 'pt-BR.pak'].includes(file)) rmSync(join(root, 'locales', file))
}

// 2. The app
stageApp(join(root, 'resources', 'app'))

// 3. The packaged `dck` CLI
await buildCli(join(root, 'resources', 'dck.mjs'))

// 4. System files: command, menu entry, icons and dpkg scripts
const write = (path, content, mode = 0o644) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  chmodSync(path, mode)
}

write(
  join(stage, 'usr', 'bin', 'dck'),
  `#!/bin/sh
# Runs the CLI inside the packaged Electron: it does not depend on the user's Node
exec env ELECTRON_RUN_AS_NODE=1 DCK_PACKAGED=1 /${INSTALL}/${NAME} /${INSTALL}/resources/dck.mjs "$@"
`,
  0o755,
)

write(
  join(stage, 'usr', 'share', 'applications', `${NAME}.desktop`),
  `[Desktop Entry]
Type=Application
Name=Dev Cockpit
Comment=Guake-style terminal with a project panel
Comment[pt_BR]=Terminal estilo Guake com painel de projetos
Exec=/${INSTALL}/${NAME} --no-sandbox
Icon=${NAME}
Terminal=false
Categories=System;TerminalEmulator;Development;
StartupWMClass=${NAME}
Actions=Toggle;

[Desktop Action Toggle]
Name=Mostrar ou ocultar
Exec=/usr/bin/dck toggle
`,
)

for (const size of [48, 128, 256, 512]) {
  const target = join(stage, 'usr', 'share', 'icons', 'hicolor', `${size}x${size}`, 'apps')
  mkdirSync(target, { recursive: true })
  cpSync(join(shell, 'assets', `app-${size}.png`), join(target, `${NAME}.png`))
}

const refresh = `#!/bin/sh
set -e
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database -q /usr/share/applications || true; fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true; fi
exit 0
`
write(join(stage, 'DEBIAN', 'postinst'), refresh, 0o755)
write(join(stage, 'DEBIAN', 'postrm'), refresh, 0o755)

const sizeKb = Math.ceil(
  Number(execFileSync('du', ['-sk', stage], { encoding: 'utf8' }).split('\t')[0]),
)
write(
  join(stage, 'DEBIAN', 'control'),
  `Package: ${NAME}
Version: ${version}
Section: devel
Priority: optional
Architecture: ${architecture}
Installed-Size: ${sizeKb}
Maintainer: Dev Cockpit <noreply@localhost>
Depends: libgtk-3-0t64 | libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0t64 | libatspi2.0-0, libuuid1, libsecret-tools
Recommends: x11-utils
Description: Guake-style terminal with a project panel
 Terminal window that opens with a global hotkey, with tabs, project search,
 a panel for sessions, git and containers, and the dck command to control it.
`,
)

// The builder's umask must not leak into the package: nothing is group or world writable
execFileSync('chmod', ['-R', 'go-w', stage])

// 5. O pacote
mkdirSync(release, { recursive: true })
const output = join(release, `${NAME}_${version}_${architecture}.deb`)
rmSync(output, { force: true })
execFileSync('dpkg-deb', ['-Zxz', '-z6', '--root-owner-group', '--build', stage, output], {
  stdio: 'inherit',
})
console.log(`pacote: ${output} (${(statSync(output).size / 1024 / 1024).toFixed(0)} MB)`)

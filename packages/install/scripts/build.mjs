// Bundles the installer into one file with no dependencies, the only code the npm package ships
import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repository = join(root, '..', '..')
const outfile = join(root, 'dist', 'install.mjs')

await build({
  entryPoints: [join(root, 'src', 'main.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  // The package's engines field: npx runs it on whatever Node the user has, down to 18
  target: 'node18',
  logLevel: 'warning',
  legalComments: 'none',
  banner: { js: '#!/usr/bin/env node' },
})
// npm only packs a LICENSE that sits in the package's own folder
copyFileSync(join(repository, 'LICENSE'), join(root, 'LICENSE'))
console.log(`installer: ${outfile}`)

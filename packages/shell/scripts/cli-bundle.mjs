// The packaged `dck` CLI, which runs inside the packaged Electron itself, without the user's Node
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const entry = join(repository, 'packages', 'cli', 'src', 'main.ts')

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  logLevel: 'warning',
  // `dck daemon` on Windows loads the Credential Manager binding, a native module the bundle cannot hold
  external: ['@napi-rs/keyring'],
  // Its UMD build loads its parts with a require the bundler cannot follow; the ESM build bundles whole
  alias: {
    'jsonc-parser': join(
      repository,
      'packages',
      'adapters',
      'jsonc',
      'node_modules',
      'jsonc-parser',
      'lib',
      'esm',
      'main.js',
    ),
  },
  banner: {
    js: "import { createRequire as __dckRequire } from 'node:module'; const require = __dckRequire(import.meta.url);",
  },
}

// `outfile` is what the wrappers run and holds only what `dck toggle` and `dck ping` need (D30); what
// main.ts loads by import() goes in `cli/` beside it. Two builds, because a single split build puts zod's
// shared modules, its whole classic API among them, in a chunk the toggle would load as well
export async function buildCli(outfile) {
  const later = new Map()
  const loadLater = {
    name: 'dck-load-later',
    setup(builder) {
      builder.onResolve({ filter: /^\.\/.*\.ts$/ }, (args) => {
        if (args.kind !== 'dynamic-import') return undefined
        const name = basename(args.path, '.ts')
        later.set(name, join(dirname(args.importer), args.path))
        return { path: `./cli/${name}.mjs`, external: true }
      })
    },
  }
  await build({ ...common, entryPoints: [entry], outfile, plugins: [loadLater] })
  await build({
    ...common,
    entryPoints: Object.fromEntries(later),
    outdir: join(dirname(outfile), 'cli'),
    outExtension: { '.js': '.mjs' },
    splitting: true,
  })
}

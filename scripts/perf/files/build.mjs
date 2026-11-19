// Bundles the bench (src/bench.js and the chunks it imports) into dist/, minified and split as Vite would
// split a dynamic import; with --sizes, prints instead what each candidate weighs on its own.
import fs from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const here = path.dirname(new URL(import.meta.url).pathname)
const dist = path.join(here, 'dist')

async function bundleBench() {
  fs.rmSync(dist, { recursive: true, force: true })
  await build({
    entryPoints: [path.join(here, 'src', 'bench.js')],
    outdir: dist,
    bundle: true,
    splitting: true,
    format: 'esm',
    minify: true,
    target: 'chrome140',
    logLevel: 'error',
  })
  fs.copyFileSync(
    path.join(here, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
    path.join(dist, 'pdf.worker.min.mjs'),
  )
}

// One candidate alone: the code it adds once `external` (what an earlier row already loads) is present
async function weigh(name, contents, external = []) {
  const result = await build({
    stdin: { contents, resolveDir: here, loader: 'js' },
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    target: 'chrome140',
    external,
    logLevel: 'error',
  })
  const code = result.outputFiles[0].contents
  return { name, min: code.length, gzip: gzipSync(code).length }
}

// What the CodeMirror base already loads: a language pack is weighed without it
const CM = [
  '@codemirror/state',
  '@codemirror/view',
  '@codemirror/language',
  '@codemirror/commands',
  '@codemirror/search',
  '@codemirror/autocomplete',
  '@lezer/common',
  '@lezer/highlight',
  '@lezer/lr',
  'style-mod',
  'w3c-keyname',
  'crelt',
]

async function sizes() {
  const rows = [
    await weigh(
      'CodeMirror base: state, view, commands, search, language',
      "export * from '@codemirror/state'; export * from '@codemirror/view'; export * from '@codemirror/commands'; export * from '@codemirror/search'; export * from '@codemirror/language'",
    ),
    await weigh('the bench editor (editor.js)', "export * from './src/editor.js'"),
    await weigh('@lezer/lr (shared by every Lezer grammar)', "export * from '@lezer/lr'", [
      '@lezer/common',
    ]),
    await weigh(
      '@codemirror/lang-javascript (JS, JSX, TS)',
      "export * from '@codemirror/lang-javascript'",
      CM,
    ),
    await weigh('@codemirror/lang-python', "export * from '@codemirror/lang-python'", CM),
    await weigh(
      '@codemirror/language-data index (no grammar)',
      "export * from '@codemirror/language-data'",
      [...CM, '@codemirror/lang-*', '@codemirror/legacy-modes/*', '@lezer/*'],
    ),
  ]
  for (const mode of ['shell', 'ruby', 'toml', 'clike', 'lua', 'dockerfile']) {
    rows.push(
      await weigh(
        `@codemirror/legacy-modes/mode/${mode}`,
        `export * from '@codemirror/legacy-modes/mode/${mode}'`,
        CM,
      ),
    )
  }
  rows.push(
    await weigh(
      'Shiki core (highlighter, vscode-textmate)',
      "export { createHighlighterCore } from '@shikijs/core'",
    ),
    await weigh(
      'Shiki Oniguruma engine, JS glue',
      "export { createOnigurumaEngine } from '@shikijs/engine-oniguruma'",
    ),
    await weigh(
      'Shiki Oniguruma engine, wasm inlined (gzip, base64)',
      "export * from '@shikijs/engine-oniguruma/wasm-inlined'",
    ),
    await weigh(
      'Shiki JavaScript regex engine',
      "export { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'",
    ),
    await weigh('Shiki grammar: typescript', "export { default } from '@shikijs/langs/typescript'"),
    await weigh('Shiki grammar: python', "export { default } from '@shikijs/langs/python'"),
    await weigh('Shiki theme: dark-plus', "export { default } from '@shikijs/themes/dark-plus'"),
    await weigh('the bench Shiki plugin (shiki.js, alone)', "export * from './src/shiki.js'", [
      ...CM,
      '@shikijs/*',
    ]),
    await weigh('markdown-it', "export { default } from 'markdown-it'"),
    await weigh('marked', "export { marked } from 'marked'"),
    await weigh('dompurify', "export { default } from 'dompurify'"),
    await weigh('pdfjs-dist (main thread)', "export * from 'pdfjs-dist'"),
  )
  const wasm = await (await import('@shikijs/engine-oniguruma/wasm-inlined')).wasmBinaryPromise
  rows.push({ name: 'Shiki Oniguruma wasm, once decoded', min: wasm.byteLength, gzip: Number.NaN })
  const worker = fs.readFileSync(
    path.join(here, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'),
  )
  rows.push({ name: 'pdfjs-dist worker', min: worker.length, gzip: gzipSync(worker).length })
  const kb = (bytes) => (bytes / 1024).toFixed(1).padStart(8)
  console.log(`${'candidate'.padEnd(60)} ${'min KB'.padStart(8)} ${'gzip KB'.padStart(8)}`)
  for (const row of rows) console.log(`${row.name.padEnd(60)} ${kb(row.min)} ${kb(row.gzip)}`)
  console.log('\nShiki grammars, every bundled language:')
  console.log(JSON.stringify(await shikiGrammars()))
  console.log('\nCodeMirror legacy modes, every mode:')
  console.log(JSON.stringify(await legacyModes()))
}

async function spread(names, entry) {
  const sizes = []
  for (const name of names) sizes.push((await weigh(name, entry(name), CM)).min)
  sizes.sort((a, b) => a - b)
  const at = (q) => Math.round(sizes[Math.floor((sizes.length - 1) * q)] / 1024)
  const total = sizes.reduce((sum, size) => sum + size, 0)
  return {
    count: sizes.length,
    medianKB: at(0.5),
    p90KB: at(0.9),
    maxKB: at(1),
    totalKB: Math.round(total / 1024),
  }
}

// Every language Shiki bundles (aliases left out), each with the grammars it embeds
async function shikiGrammars() {
  const { languageNames } = await import('@shikijs/langs')
  return spread(languageNames, (name) => `export { default } from '@shikijs/langs/${name}'`)
}

async function legacyModes() {
  const folder = path.join(here, 'node_modules', '@codemirror', 'legacy-modes', 'mode')
  const names = fs
    .readdirSync(folder)
    .filter((file) => file.endsWith('.js'))
    .map((file) => file.slice(0, -3))
  return spread(names, (name) => `export * from '@codemirror/legacy-modes/mode/${name}'`)
}

if (process.argv.includes('--sizes')) await sizes()
else await bundleBench()

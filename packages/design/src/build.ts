import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCss } from './css.ts'
import { tokens } from './tokens.ts'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'tokens.css'), `${buildCss(tokens)}\n`)
console.log(`tokens.css gerado em ${outDir}`)

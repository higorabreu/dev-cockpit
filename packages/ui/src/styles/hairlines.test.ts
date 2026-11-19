import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every rule of every stylesheet, comments taken out, with the file it comes from
const rules = readdirSync(import.meta.dirname)
  .filter((file) => file.endsWith('.css'))
  .flatMap((file) => {
    const css = readFileSync(join(import.meta.dirname, file), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
      file,
      selector: (match[1] ?? '').trim(),
      body: match[2] ?? '',
    }))
  })

const declarations = (body: string) =>
  body
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)

describe('hairlines', () => {
  it('should draw every 1px line in the line color with the hairline token when reading the styles', () => {
    const literal = rules.flatMap((rule) =>
      declarations(rule.body)
        .filter((declaration) => /^border[\w-]*:\s*1px\b.*var\(--line\)/.test(declaration))
        .map((declaration) => `${rule.file} ${rule.selector}: ${declaration}`),
    )

    expect(literal).toEqual([])
  })

  it('should draw no line as a filled box when reading the styles', () => {
    const filled = rules
      .filter((rule) => /(^|;)\s*background:\s*var\(--line\)/.test(rule.body))
      .map((rule) => `${rule.file} ${rule.selector}`)

    expect(filled).toEqual([])
  })

  it('should not place a bordered box with a half translate when reading the styles', () => {
    const translated = rules
      .filter((rule) => /translate[XY]?\(-50%/.test(rule.body) && /(^|;)\s*border:/.test(rule.body))
      .map((rule) => `${rule.file} ${rule.selector}`)

    expect(translated).toEqual([])
  })
})

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

const bodyOf = (file: string, selector: string) =>
  rules.find((rule) => rule.file === file && rule.selector === selector)?.body ?? ''

// The bar and the headers that sit side by side, whose lines must meet on one device pixel
const bars = [
  { file: 'layout.css', selector: '#bar', size: 'var(--size-bar)' },
  { file: 'panel.css', selector: '.phead', size: 'var(--size-header)' },
  { file: 'file-view.css', selector: '.fv-head', size: 'var(--size-header)' },
  { file: 'review.css', selector: '.rv-head', size: 'var(--size-header)' },
]

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

  it.each(bars)(
    'should size $selector from its token with the divider inside when reading $file',
    ({ file, selector, size }) => {
      const body = bodyOf(file, selector)

      expect(body).toMatch(/box-sizing:\s*border-box/)
      expect(body).toContain(`height: ${size}`)
    },
  )

  it.each(bars)(
    'should set no fractional pixel or percentage on the box of $selector when reading $file',
    ({ file, selector }) => {
      const box = declarations(bodyOf(file, selector)).filter((declaration) =>
        /^(height|min-height|max-height|padding|margin|border|flex)[\w-]*:/.test(declaration),
      )

      expect(box.filter((declaration) => /\d\.\d+px|\d%/.test(declaration))).toEqual([])
    },
  )

  it('should give the panel header its own divider in place of the first section line when reading the panel styles', () => {
    expect(bodyOf('panel.css', '.phead')).toContain(
      'border-bottom: var(--size-hairline) solid var(--line)',
    )
    expect(bodyOf('panel.css', '.pscroll > :first-child > .psec:first-child')).toMatch(
      /border-top:\s*0/,
    )
  })
})

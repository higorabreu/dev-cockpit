import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every rule of every stylesheet, with its declarations and without comments
const rules = readdirSync(import.meta.dirname)
  .filter((file) => file.endsWith('.css'))
  .flatMap((file) =>
    [
      ...readFileSync(join(import.meta.dirname, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/([^{}]+)\{([^}]*)\}/g),
    ].map((match) => ({ selector: (match[1] ?? '').trim(), body: match[2] ?? '' })),
  )

describe('inactive tabs', () => {
  it('should make only the active tab visible when listing the rules that set visibility', () => {
    const visible = rules.filter((rule) => /visibility:\s*visible/.test(rule.body))

    expect(visible.map((rule) => rule.selector)).toEqual(['.tabview.active'])
  })

  it('should never scroll the document when reading the body rules', () => {
    const body = rules.filter((rule) => rule.selector === 'body')

    expect(body.some((rule) => /overflow:\s*hidden/.test(rule.body))).toBe(true)
  })
})

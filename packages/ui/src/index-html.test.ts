import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { catalogs } from '@dck/core'
import { describe, expect, it } from 'vitest'

const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8')
const keysIn = (attribute: string) =>
  [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map((match) => match[1] ?? '')

describe('index.html texts', () => {
  it('should only use catalog keys when an element asks for a translated label', () => {
    const keys = [...keysIn('data-i18n-aria'), ...keysIn('data-i18n-placeholder')]

    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(Object.keys(catalogs['pt-BR']), key).toContain(key)
  })

  it('should not carry fixed aria labels or placeholders when the page is built', () => {
    expect(html).not.toMatch(/\saria-label="/)
    expect(html).not.toMatch(/\splaceholder="/)
  })
})

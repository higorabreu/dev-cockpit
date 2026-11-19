import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { catalogs, isShortcutId } from '@dck/core'
import { describe, expect, it } from 'vitest'

const html = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8')
const keysIn = (attribute: string) =>
  [...html.matchAll(new RegExp(`${attribute}="([^"]+)"`, 'g'))].map((match) => match[1] ?? '')

describe('index.html texts', () => {
  it('should only use catalog keys when an element asks for a translated label', () => {
    const keys = [
      ...keysIn('data-i18n-aria'),
      ...keysIn('data-i18n-tip'),
      ...keysIn('data-i18n-placeholder'),
    ]

    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) expect(Object.keys(catalogs['pt-BR']), key).toContain(key)
  })

  it('should not carry fixed aria labels or placeholders when the page is built', () => {
    expect(html).not.toMatch(/\saria-label="/)
    expect(html).not.toMatch(/\splaceholder="/)
  })

  // A key the user can change comes from the keymap, never written in the page
  it('should name the action of a tooltip key instead of the key when a button has a shortcut', () => {
    const actions = keysIn('data-tip-shortcut')

    expect(html).not.toMatch(/\sdata-tip-key="/)
    expect(actions.length).toBeGreaterThan(0)
    for (const action of actions) expect(isShortcutId(action), action).toBe(true)
  })
})

describe('index.html policy', () => {
  const policy = /Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
  const directive = (name: string) =>
    policy
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .find(([first]) => first === name)
      ?.slice(1)

  // An opened image or PDF comes from the cockpit's own protocol; https images only once the user asks
  it('should let images and frames come only from the file protocol when the page is built', () => {
    expect(directive('img-src')).toEqual(["'self'", 'data:', 'dck-file:', 'https:'])
    expect(directive('frame-src')).toEqual(['dck-file:'])
    expect(directive('object-src')).toEqual(["'none'"])
    expect(directive('script-src')).toBeUndefined()
    expect(directive('default-src')).toEqual(["'self'"])
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Every rule of the stylesheets that sets a stacking order
const layers = readdirSync(import.meta.dirname)
  .filter((file) => file.endsWith('.css'))
  .flatMap((file) => {
    const css = readFileSync(join(import.meta.dirname, file), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((match) => {
      const z = /z-index:\s*(\d+)/.exec(match[2] ?? '')
      return z ? [{ selector: (match[1] ?? '').trim(), z: Number(z[1]) }] : []
    })
  })

// A rule may name several layers at once ("#search, #files")
const zOf = (selector: string) =>
  layers.find((layer) => layer.selector.split(',').some((one) => one.trim() === selector))?.z ??
  Number.NaN

// The quit card asks before the app goes, and a tooltip names what is under the pointer: both above the menu
const ABOVE_MENU = ['#quit', '#tooltip']

describe('hold menu stacking', () => {
  it('should draw the hold menu above every other layer when Settings, a view, a search or the tab list is open', () => {
    const menu = zOf('#menu')

    const covering = layers.filter(
      (layer) =>
        layer.selector !== '#menu' && !ABOVE_MENU.includes(layer.selector) && layer.z >= menu,
    )

    expect(covering).toEqual([])
    for (const overlay of ['#settings', '#views', '#search', '#files', '#tab-list', '#tab-menu'])
      expect(zOf(overlay)).toBeLessThan(menu)
  })

  it('should keep the quit card and the tooltip above the hold menu when both are open', () => {
    const menu = zOf('#menu')

    const below = ABOVE_MENU.filter((selector) => !(zOf(selector) > menu))

    expect(below).toEqual([])
  })
})

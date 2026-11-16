import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(import.meta.dirname, 'review.css'), 'utf8')

const bodyOf = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(
    (match) => (match[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').trim() === selector,
  )?.[2] ?? ''

describe('review diff on a sideways scroll', () => {
  it('should keep both line numbers and the sign in place when a long line scrolls', () => {
    const gutter = bodyOf('.rv-gutter')

    expect(gutter).toMatch(/position:\s*sticky/)
    expect(gutter).toContain('left: var(--rv-edge)')
  })

  it('should cut the code where the gutter starts so nothing shows through it', () => {
    expect(bodyOf('.rv-row[data-kind] .rv-code')).toContain('clip-path: inset(0 0 0 var(--rv-x')
  })

  it('should keep the left strip empty while the rows are scrolled sideways', () => {
    expect(bodyOf('.rv-inner')).toContain('clip-path: inset(0 0 0 var(--rv-x')
    expect(bodyOf('.rv-lines')).toContain('--rv-edge: var(--size-scrollbar)')
  })

  it('should keep the text of hunk headers, hidden lines and file headers in view', () => {
    const band = bodyOf('.rv-band')

    expect(band).toMatch(/position:\s*sticky/)
    expect(band).toContain('width: var(--rv-view')
  })

  it('should pin the header of the file being read on top of the scroll', () => {
    const pin = bodyOf('.rv-pin')

    expect(pin).toMatch(/position:\s*sticky/)
    expect(pin).toMatch(/top:\s*0/)
  })
})

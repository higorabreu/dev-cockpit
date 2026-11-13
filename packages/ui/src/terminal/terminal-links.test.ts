import { describe, expect, it } from 'vitest'
import { linkBox, linkModifierFor, opensLink } from './terminal-links.ts'

const click = { ctrlKey: false, metaKey: false }

describe('opensLink', () => {
  it('should open the link when Ctrl is held on Linux and Windows', () => {
    const opens = opensLink({ ...click, ctrlKey: true }, 'ctrl')

    expect(opens).toBe(true)
  })

  it('should keep selecting text when the click has no modifier', () => {
    expect(opensLink(click, 'ctrl')).toBe(false)
    expect(opensLink(click, 'meta')).toBe(false)
  })

  it('should open with Cmd and not with Ctrl when the system is macOS', () => {
    expect(opensLink({ ...click, metaKey: true }, 'meta')).toBe(true)
    expect(opensLink({ ...click, ctrlKey: true }, 'meta')).toBe(false)
  })

  it('should ignore Cmd when the system is not macOS', () => {
    expect(opensLink({ ...click, metaKey: true }, 'ctrl')).toBe(false)
  })
})

describe('linkModifierFor', () => {
  it('should use Cmd when the platform is macOS', () => {
    expect(linkModifierFor('MacIntel')).toBe('meta')
  })

  it('should use Ctrl when the platform is Linux or Windows', () => {
    expect(linkModifierFor('Linux x86_64')).toBe('ctrl')
    expect(linkModifierFor('Win32')).toBe('ctrl')
  })
})

describe('linkBox', () => {
  const screen = { x: 10, y: 20, width: 800, height: 240 }
  const view = { viewportY: 100, cols: 100, rows: 24 }

  it('should cover the cells of the link when it sits on one line', () => {
    const box = linkBox({ start: { x: 6, y: 103 }, end: { x: 30, y: 103 } }, view, screen)

    expect(box).toEqual({ x: 10 + 5 * 8, y: 20 + 2 * 10, width: 25 * 8, height: 10 })
  })

  it('should cover whole lines when the link wraps', () => {
    const box = linkBox({ start: { x: 90, y: 101 }, end: { x: 12, y: 102 } }, view, screen)

    expect(box).toEqual({ x: 10, y: 20, width: 800, height: 20 })
  })
})

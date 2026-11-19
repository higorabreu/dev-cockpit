import { createTranslator } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { filePathHint, folderPathHint, pathRoute } from './path-open.ts'

const { t } = createTranslator('en')
const click = { label: 'Ctrl', alternateLabel: 'Ctrl+Shift' }

describe('pathRoute', () => {
  it.each([
    ['cockpit', true, false],
    ['system', true, true],
    ['system', false, false],
    ['cockpit', false, true],
  ] as const)(
    'should go to the %s when the setting is %s and Shift held is %s',
    (route, inCockpit, alternate) => {
      expect(pathRoute(inCockpit, alternate)).toBe(route)
    },
  )
})

describe('filePathHint', () => {
  it("should offer the system's app with Shift when files open in the cockpit", () => {
    const hint = filePathHint(click, t, true)

    expect(hint).toEqual({
      key: 'Ctrl',
      gesture: { click: 'left click', action: 'Open' },
      alternate: {
        key: 'Ctrl+Shift',
        gesture: { click: 'left click', action: "Open in the system's app" },
      },
    })
  })

  it('should offer the cockpit with Shift when the setting sends paths to the system', () => {
    expect(filePathHint(click, t, false).alternate?.gesture.action).toBe('Open in the cockpit')
  })
})

describe('folderPathHint', () => {
  it('should offer a single click when the path is a folder', () => {
    expect(folderPathHint(click, t)).toEqual({
      key: 'Ctrl',
      gesture: { click: 'left click', action: 'Open' },
    })
  })
})

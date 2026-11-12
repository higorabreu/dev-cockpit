import { describe, expect, it } from 'vitest'
import { createElectronScreen } from '../../electron/screen.ts'
import { createGtkWorkareas, parseGtkWorkareas } from './x11-workareas.ts'

const output =
  '_GTK_WORKAREAS_D0(CARDINAL) = 0, 0, 1920, 1017, 1920, 32, 1920, 985, 3840, 0, 1920, 1137\n'

describe('parseGtkWorkareas', () => {
  it('should return one rectangle per monitor when the property lists several', () => {
    const result = parseGtkWorkareas(output)

    expect(result).toEqual([
      { x: 0, y: 0, width: 1920, height: 1017 },
      { x: 1920, y: 32, width: 1920, height: 985 },
      { x: 3840, y: 0, width: 1920, height: 1137 },
    ])
  })

  it('should return nothing when the property is missing or malformed', () => {
    expect(parseGtkWorkareas('')).toEqual([])
    expect(parseGtkWorkareas('_GTK_WORKAREAS_D0:  not found.')).toEqual([])
    expect(parseGtkWorkareas('_GTK_WORKAREAS_D0(CARDINAL) = 0, 0, 1920')).toEqual([])
  })
})

describe('createGtkWorkareas', () => {
  it('should serve the areas read in the background when asked after the read finishes', async () => {
    const areas = createGtkWorkareas(async () => output)
    await Promise.resolve()

    expect(areas()).toHaveLength(3)
  })
})

describe('createElectronScreen with system work areas', () => {
  const api = {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({
      id: 1,
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    }),
  }

  it('should use the system work area when the monitor has one', () => {
    const screen = createElectronScreen(api, () => parseGtkWorkareas(output))

    expect(screen.displayNearest({ x: 10, y: 10 }).workArea.height).toBe(1017)
  })

  it('should keep the Electron work area when the system reports none', () => {
    const screen = createElectronScreen(api)

    expect(screen.displayNearest({ x: 10, y: 10 }).workArea.height).toBe(1080)
  })
})

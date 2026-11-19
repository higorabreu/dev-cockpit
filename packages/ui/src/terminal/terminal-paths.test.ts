import type { ResolvedPath } from '@dck/core'
import type { IBufferCell, IBufferLine, ILink, ILinkProvider, Terminal } from '@xterm/xterm'
import { describe, expect, it } from 'vitest'
import type { FilePlace } from './path-open.ts'
import {
  attachPaths,
  candidateRange,
  createResolveCache,
  type PathLinkOptions,
  readLogicalLine,
  tipText,
} from './terminal-paths.ts'

// One row of the screen; a `wide` character takes its cell and an empty one after it
function row(text: string, isWrapped = false, wide: readonly string[] = []): IBufferLine {
  const cells: { chars: string; width: number }[] = []
  for (const char of text) {
    if (wide.includes(char)) cells.push({ chars: char, width: 2 }, { chars: '', width: 0 })
    else cells.push({ chars: char, width: 1 })
  }
  return {
    isWrapped,
    length: cells.length,
    getCell: (x: number) => {
      const cell = cells[x]
      return cell
        ? ({ getChars: () => cell.chars, getWidth: () => cell.width } as IBufferCell)
        : undefined
    },
  } as IBufferLine
}

const buffer = (rows: readonly IBufferLine[]) => ({ getLine: (y: number) => rows[y] })

describe('readLogicalLine', () => {
  it('should join the rows when a long line wraps', () => {
    const rows = [row('$ ls'), row('see src/ap'), row('p.ts now', true), row('next')]

    const line = readLogicalLine(buffer(rows), 3)

    expect(line.text).toBe('see src/app.ts now')
    expect(line.cells[9]).toEqual({ x: 10, y: 2, width: 1 })
    expect(line.cells[10]).toEqual({ x: 1, y: 3, width: 1 })
  })

  it('should keep the cell of each character when the line has wide characters', () => {
    const line = readLogicalLine(buffer([row('界 a.ts', false, ['界'])]), 1)

    expect(line.text).toBe('界 a.ts')
    expect(line.cells.map((cell) => cell.x)).toEqual([1, 3, 4, 5, 6, 7])
  })
})

describe('candidateRange', () => {
  it('should cover the path with its suffix across rows when it wraps', () => {
    const line = readLogicalLine(buffer([row('see src/ap'), row('p.ts:4 now', true)]), 1)

    const range = candidateRange(line, { path: 'src/app.ts', start: 4, end: 16 })

    expect(range).toEqual({ start: { x: 5, y: 1 }, end: { x: 6, y: 2 } })
  })
})

describe('createResolveCache', () => {
  it('should ask the disk once when the same paths are hovered again shortly after', async () => {
    let calls = 0
    let time = 0
    const cached = createResolveCache(
      async () => {
        calls += 1
        return []
      },
      () => time,
    )

    await cached('/srv/acme', ['a.ts'])
    time = 1500
    await cached('/srv/acme', ['a.ts'])

    expect(calls).toBe(1)
  })

  it('should ask again when the entry is old or the directory changed', async () => {
    let calls = 0
    let time = 0
    const cached = createResolveCache(
      async () => {
        calls += 1
        return []
      },
      () => time,
    )

    await cached('/srv/acme', ['a.ts'])
    await cached('/srv/other', ['a.ts'])
    time = 2500
    await cached('/srv/acme', ['a.ts'])

    expect(calls).toBe(3)
  })
})

function setup(text: string, disk: Record<string, ResolvedPath['kind']>) {
  let provider: ILinkProvider | undefined
  const terminal = {
    buffer: { active: buffer([row(text)]) },
    registerLinkProvider(registered: ILinkProvider) {
      provider = registered
      return { dispose() {} }
    },
  } as unknown as Terminal
  const asked: { base: string | undefined; paths: readonly string[] }[] = []
  const files: string[] = []
  const opened: { path: string; place: FilePlace; alternate: boolean }[] = []
  const folders: { path: string; x: number; y: number }[] = []
  const options: PathLinkOptions = {
    modifier: 'ctrl',
    hint: (kind) => ({
      key: 'Ctrl',
      gesture: { click: 'left click', action: kind === 'dir' ? 'Open folder' : 'Open' },
    }),
    shown: (path) => path.replace('/srv/acme', 'acme'),
    cwd: () => '/srv/acme',
    resolve: async (base, paths) => {
      asked.push({ base, paths })
      return paths.map((path) => {
        const absolute = path.startsWith('/') ? path : `/srv/acme/${path}`
        return { path: absolute, kind: disk[absolute] ?? 'missing' }
      })
    },
    openFile(path, place, alternate) {
      files.push(path)
      opened.push({ path, place, alternate })
    },
    openFolder: (path, x, y) => void folders.push({ path, x, y }),
    tip: () => undefined,
  }
  attachPaths(terminal, options)
  const links = () =>
    new Promise<ILink[]>((done) => provider?.provideLinks(1, (found) => done(found ?? [])))
  return { links, asked, files, folders, opened }
}

const click = (init: MouseEventInit = {}) =>
  ({
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    clientX: 40,
    clientY: 60,
    ...init,
  }) as MouseEvent

describe('attachPaths', () => {
  it('should link only the paths that exist when the line is hovered', async () => {
    const { links, asked } = setup('src/app.ts:3 src/gone.ts src', {
      '/srv/acme/src/app.ts': 'file',
    })

    const found = await links()

    expect(asked).toEqual([{ base: '/srv/acme', paths: ['src/app.ts', 'src/gone.ts'] }])
    expect(found.map((link) => link.text)).toEqual(['src/app.ts:3'])
  })

  it('should open the file when it is clicked with the modifier', async () => {
    const { links, files } = setup('src/app.ts', { '/srv/acme/src/app.ts': 'file' })
    const [link] = await links()

    link?.activate(click({ ctrlKey: true }), 'src/app.ts')

    expect(files).toEqual(['/srv/acme/src/app.ts'])
  })

  it('should do nothing when the path is clicked without the modifier', async () => {
    const { links, files, folders } = setup('src/app.ts ./src', {
      '/srv/acme/src/app.ts': 'file',
      '/srv/acme/./src': 'dir',
    })

    for (const link of await links()) link.activate(click(), link.text)

    expect(files).toEqual([])
    expect(folders).toEqual([])
  })

  it('should offer the folder menu at the click point when a folder is clicked with the modifier', async () => {
    const { links, folders, files } = setup('cd /srv/acme/web', { '/srv/acme/web': 'dir' })
    const [link] = await links()

    link?.activate(click({ ctrlKey: true }), '/srv/acme/web')

    expect(folders).toEqual([{ path: '/srv/acme/web', x: 40, y: 60 }])
    expect(files).toEqual([])
  })

  it('should not ask the host when the line has no path', async () => {
    const { links, asked } = setup('build finished in 1.5 s', {})

    expect(await links()).toEqual([])
    expect(asked).toEqual([])
  })

  it('should open the file at the line and column the line names when it is clicked', async () => {
    // Arrange
    const { links, opened } = setup('src/app.ts(12,5): error TS2322', {
      '/srv/acme/src/app.ts': 'file',
    })
    const [link] = await links()

    // Act
    link?.activate(click({ ctrlKey: true }), link.text)

    // Assert
    expect(link?.text).toBe('src/app.ts(12,5)')
    expect(opened).toEqual([
      { path: '/srv/acme/src/app.ts', place: { line: 12, column: 5 }, alternate: false },
    ])
  })

  it('should ask for the other way when Shift is held with the modifier', async () => {
    const { links, opened } = setup('src/app.ts:3', { '/srv/acme/src/app.ts': 'file' })
    const [link] = await links()

    link?.activate(click({ ctrlKey: true, shiftKey: true }), link.text)

    expect(opened).toEqual([{ path: '/srv/acme/src/app.ts', place: { line: 3 }, alternate: true }])
  })

  it('should offer the folder menu and no file when a folder is clicked with Shift too', async () => {
    const { links, folders, opened } = setup('see /srv/acme/web', { '/srv/acme/web': 'dir' })
    const [link] = await links()

    link?.activate(click({ ctrlKey: true, shiftKey: true }), link.text)

    expect(folders).toHaveLength(1)
    expect(opened).toEqual([])
  })
})

describe('tipText', () => {
  it('should name the place the click goes to when the line gives one', () => {
    expect(tipText('acme/src/app.ts', { line: 12, column: 5 })).toBe('acme/src/app.ts:12:5')
    expect(tipText('acme/src/app.ts', { line: 12 })).toBe('acme/src/app.ts:12')
    expect(tipText('acme/src', {})).toBe('acme/src')
  })
})

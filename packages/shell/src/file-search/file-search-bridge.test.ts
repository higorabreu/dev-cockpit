import { type FileFinder, type FileListing, hostChannels, silentLogger } from '@dck/core'
import { describe, expect, it } from 'vitest'
import type { IpcMainApi } from '../electron/host-bridge.ts'
import { registerFileSearchBridge } from './file-search-bridge.ts'

const listing: FileListing = {
  kind: 'git',
  root: '/home/ana/acme',
  files: ['src/app.ts'],
  ignored: [],
  truncated: false,
  partial: true,
}
const others = { files: ['notes.md'], ignored: ['.env', 'node_modules/'], truncated: false }

function setUp() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain: IpcMainApi = {
    handle: (channel, listener) =>
      void handlers.set(channel, listener as (...args: unknown[]) => unknown),
    on: (channel, listener) =>
      void handlers.set(channel, listener as (...args: unknown[]) => unknown),
  }
  const listed: string[] = []
  const expanded: string[] = []
  const finder: FileFinder = {
    list: async (cwd) => {
      listed.push(cwd)
      return listing
    },
    others: async () => others,
    expand: async (root, folder) => {
      expanded.push(`${root}|${folder}`)
      return { entries: [`${folder}react/`, `${folder}zod/index.js`], truncated: false }
    },
  }
  registerFileSearchBridge({
    ipcMain,
    finder,
    isFolder: async (path) => path.startsWith('/home/ana'),
    logger: silentLogger,
  })
  const call = (channel: string, ...args: unknown[]) => handlers.get(channel)?.({}, ...args)
  return { call, listed, expanded }
}

describe('registerFileSearchBridge', () => {
  it('should list an absolute folder that exists', async () => {
    // Arrange
    const { call, listed } = setUp()

    // Act
    const answer = await call(hostChannels.fileSearchList, '/home/ana/acme/src')

    // Assert
    expect(answer).toEqual(listing)
    expect(listed).toEqual(['/home/ana/acme/src'])
  })

  it('should list nothing when the folder is relative, missing or not text', async () => {
    // Arrange
    const { call, listed } = setUp()

    // Act
    const answers = [
      await call(hostChannels.fileSearchList, 'acme/src'),
      await call(hostChannels.fileSearchList, '/tmp/gone'),
      await call(hostChannels.fileSearchList, 42),
    ]

    // Assert
    expect(answers.map((answer) => (answer as FileListing).files)).toEqual([[], [], []])
    expect(listed).toEqual([])
  })

  it('should step into a closed folder a listing named, and then into one found inside it', async () => {
    // Arrange
    const { call, expanded } = setUp()
    await call(hostChannels.fileSearchList, '/home/ana/acme')
    await call(hostChannels.fileSearchOthers, '/home/ana/acme')

    // Act
    await call(hostChannels.fileSearchExpand, { root: '/home/ana/acme', folder: 'node_modules/' })
    await call(hostChannels.fileSearchExpand, {
      root: '/home/ana/acme',
      folder: 'node_modules/react/',
    })

    // Assert
    expect(expanded).toEqual(['/home/ana/acme|node_modules/', '/home/ana/acme|node_modules/react/'])
  })

  it('should refuse a folder no listing closed, or one that climbs out of the root', async () => {
    // Arrange
    const { call, expanded } = setUp()
    await call(hostChannels.fileSearchList, '/home/ana/acme')
    await call(hostChannels.fileSearchOthers, '/home/ana/acme')

    // Act
    const answers = [
      await call(hostChannels.fileSearchExpand, { root: '/home/ana/acme', folder: 'src/' }),
      await call(hostChannels.fileSearchExpand, { root: '/home/ana/acme', folder: '../' }),
      await call(hostChannels.fileSearchExpand, {
        root: '/home/ana/other',
        folder: 'node_modules/',
      }),
      await call(hostChannels.fileSearchExpand, { root: '/home/ana/acme', folder: '.env' }),
    ]

    // Assert
    expect(answers).toEqual(Array(4).fill({ entries: [], truncated: false }))
    expect(expanded).toEqual([])
  })

  it('should give the untracked and ignored files only of a root a partial listing named', async () => {
    // Arrange
    const { call } = setUp()
    const before = await call(hostChannels.fileSearchOthers, '/home/ana/acme')
    await call(hostChannels.fileSearchList, '/home/ana/acme')

    // Act
    const after = await call(hostChannels.fileSearchOthers, '/home/ana/acme')
    const other = await call(hostChannels.fileSearchOthers, '/home/ana/other')

    // Assert
    expect(before).toEqual({ files: [], ignored: [], truncated: false })
    expect(after).toEqual(others)
    expect(other).toEqual({ files: [], ignored: [], truncated: false })
  })
})

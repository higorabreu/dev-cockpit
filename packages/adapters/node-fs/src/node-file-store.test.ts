import { createHash } from 'node:crypto'
import {
  chmod,
  link,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ErrorBody, FileChange, FileStamp, Result } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodeFileStore } from './node-file-store.ts'

let folder = ''
const text = (value: string) => new TextEncoder().encode(value)

function value<T>(result: Result<T, ErrorBody>): T {
  if (!result.ok) throw new Error(`invariant: ${JSON.stringify(result)}`)
  return result.value
}

async function stampOf(path: string): Promise<FileStamp> {
  return value(await createNodeFileStore().read(path)).stamp
}

beforeEach(async () => {
  // macOS links /var to /private/var, and the watcher reports the real path
  folder = await realpath(await mkdtemp(join(tmpdir(), 'dck-files-')))
})

afterEach(() => rm(folder, { recursive: true, force: true }))

describe('createNodeFileStore read', () => {
  it('should read the bytes with their size and SHA-256 when the file exists', async () => {
    // Arrange
    const path = join(folder, '.env')
    await writeFile(path, 'TOKEN=abc\n')

    // Act
    const read = value(await createNodeFileStore().read(path))

    // Assert
    expect(new TextDecoder().decode(read.bytes)).toBe('TOKEN=abc\n')
    expect(read.stamp).toMatchObject({
      size: 10,
      hash: createHash('sha256').update('TOKEN=abc\n').digest('hex'),
    })
  })

  it('should give only the first bytes when asked for the head', async () => {
    const path = join(folder, 'notes.txt')
    await writeFile(path, 'abcdef')

    const head = value(await createNodeFileStore().head(path, 3))

    expect(new TextDecoder().decode(head)).toBe('abc')
  })

  it('should fail as missing when there is no file and as unreadable when it is a folder', async () => {
    const store = createNodeFileStore()

    const missing = await store.stat(join(folder, 'missing.ts'))
    const directory = await store.stat(folder)

    expect(missing).toMatchObject({ ok: false, error: { data: { code: 'DCK-FIL-001' } } })
    expect(directory).toMatchObject({ ok: false, error: { data: { code: 'DCK-FIL-002' } } })
  })
})

describe('createNodeFileStore write', () => {
  it('should replace the file whole, keep its mode and leave no temporary file when the disk holds the base', async () => {
    // Arrange
    const path = join(folder, 'run.sh')
    await writeFile(path, '#!/bin/sh\necho one\n')
    await chmod(path, 0o750)
    const before = await stat(path)
    const base = await stampOf(path)

    // Act
    const written = value(
      await createNodeFileStore().write(path, text('#!/bin/sh\necho two\n'), base),
    )

    // Assert
    expect(await readFile(path, 'utf8')).toBe('#!/bin/sh\necho two\n')
    expect((await stat(path)).mode & 0o7777).toBe(0o750)
    expect((await stat(path)).ino).not.toBe(before.ino)
    expect(written).toEqual({ kind: 'written', stamp: await stampOf(path) })
    expect(await readdir(folder)).toEqual(['run.sh'])
  })

  it('should write nothing and give what the disk holds when another writer changed the file', async () => {
    // Arrange
    const path = join(folder, 'index.ts')
    await writeFile(path, 'export const a = 1\n')
    const base = await stampOf(path)
    await writeFile(path, 'export const a = 2\n')

    // Act
    const written = value(await createNodeFileStore().write(path, text('mine\n'), base))

    // Assert
    expect(written).toEqual({ kind: 'changed', disk: await stampOf(path) })
    expect(await readFile(path, 'utf8')).toBe('export const a = 2\n')
  })

  it('should write when only the time moved since the base was read', async () => {
    // Arrange
    const path = join(folder, 'index.ts')
    await writeFile(path, 'one\n')
    const base = await stampOf(path)
    await utimes(path, new Date(2030, 0, 1), new Date(2030, 0, 1))

    // Act
    const written = value(await createNodeFileStore().write(path, text('two\n'), base))

    // Assert
    expect(written.kind).toBe('written')
  })

  it('should give a conflict when the file was deleted, and create it when no file is expected', async () => {
    // Arrange
    const path = join(folder, 'gone.ts')
    await writeFile(path, 'one\n')
    const base = await stampOf(path)
    await unlink(path)
    const store = createNodeFileStore()

    // Act
    const refused = value(await store.write(path, text('mine\n'), base))
    const created = value(await store.write(path, text('mine\n'), null))

    // Assert
    expect(refused).toEqual({ kind: 'changed', disk: undefined })
    expect(created.kind).toBe('written')
    expect(await readFile(path, 'utf8')).toBe('mine\n')
  })

  it('should write through a symbolic link to its file and keep the link', async () => {
    // Arrange
    const real = join(folder, 'real.json')
    const linked = join(folder, 'linked.json')
    await writeFile(real, '{}\n')
    await symlink('real.json', linked)

    // Act
    await createNodeFileStore().write(linked, text('{ "a": 1 }\n'), await stampOf(linked))

    // Assert
    expect(await readFile(real, 'utf8')).toBe('{ "a": 1 }\n')
    expect(await readlink(linked)).toBe('real.json')
  })

  it('should write in place when the file has another hard link, so both names see the text', async () => {
    // Arrange
    const path = join(folder, 'a.txt')
    const other = join(folder, 'b.txt')
    await writeFile(path, 'one\n')
    await link(path, other)

    // Act
    await createNodeFileStore().write(path, text('two\n'), await stampOf(path))

    // Assert
    expect(await readFile(other, 'utf8')).toBe('two\n')
  })

  it.skipIf(process.getuid?.() === 0)(
    'should fail and leave the file as it was when the user may not write it',
    async () => {
      // Arrange
      const path = join(folder, 'locked.txt')
      await writeFile(path, 'one\n')
      await chmod(path, 0o444)

      // Act
      const written = await createNodeFileStore().write(path, text('two\n'), await stampOf(path))

      // Assert
      expect(written).toMatchObject({ ok: false, error: { data: { code: 'DCK-FIL-003' } } })
      expect(await readFile(path, 'utf8')).toBe('one\n')
    },
  )
})

describe('createNodeFileStore watch', () => {
  const store = () => createNodeFileStore({ settleMs: 20 })

  function collect() {
    const changes: FileChange[] = []
    return { changes, listener: (change: FileChange) => void changes.push(change) }
  }

  it('should report a change once when another writer renames a new file over it', async () => {
    // Arrange
    const path = join(folder, 'index.ts')
    await writeFile(path, 'one\n')
    const { changes, listener } = collect()
    const stop = value(store().watch(path, await stampOf(path), listener))

    // Act
    await writeFile(join(folder, '.index.ts.tmp'), 'two\n')
    await rename(join(folder, '.index.ts.tmp'), path)

    // Assert
    await vi.waitFor(() => expect(changes).toHaveLength(1))
    expect(changes[0]).toEqual({ kind: 'changed', stamp: await stampOf(path) })
    stop()
  })

  it('should keep following the file after the rename when it changes again', async () => {
    // Arrange
    const path = join(folder, 'index.ts')
    await writeFile(path, 'one\n')
    const { changes, listener } = collect()
    const stop = value(store().watch(path, await stampOf(path), listener))
    await writeFile(join(folder, 'next'), 'two\n')
    await rename(join(folder, 'next'), path)
    await vi.waitFor(() => expect(changes).toHaveLength(1))

    // Act
    await writeFile(path, 'three\n')

    // Assert
    await vi.waitFor(() => expect(changes).toHaveLength(2))
    expect(changes[1]).toEqual({ kind: 'changed', stamp: await stampOf(path) })
    stop()
  })

  it('should stay quiet when the file is touched or written with the same bytes', async () => {
    // Arrange
    const path = join(folder, 'index.ts')
    await writeFile(path, 'one\n')
    const { changes, listener } = collect()
    const stop = value(store().watch(path, await stampOf(path), listener))

    // Act
    await utimes(path, new Date(2030, 0, 1), new Date(2030, 0, 1))
    await writeFile(path, 'one\n')
    await writeFile(join(folder, 'other.ts'), 'x\n')
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Assert
    expect(changes).toEqual([])
    stop()
  })

  it('should report a deletion made while the folder watch starts when no event comes for it', async () => {
    // Arrange: a folder watch that never reports, as macOS's events can be for a change right at its start
    const path = join(folder, 'index.ts')
    await writeFile(path, 'one\n')
    const { changes, listener } = collect()
    const silent = createNodeFileStore({
      settleMs: 20,
      watchFolder: () => ({ close: () => undefined }),
    })
    const stop = value(silent.watch(path, await stampOf(path), listener))

    // Act
    await unlink(path)

    // Assert
    await vi.waitFor(() => expect(changes).toEqual([{ kind: 'deleted' }]))
    stop()
  })

  it('should report only the end of a write that empties the file first and fills it later', async () => {
    // Arrange
    const path = join(folder, 'index.ts')
    await writeFile(path, 'one\n')
    let event: (name: string | null) => void = () => undefined
    const { changes, listener } = collect()
    const watched = createNodeFileStore({
      settleMs: 60,
      watchFolder: (_folder, onChange) => {
        event = onChange
        return { close: () => undefined }
      },
    })
    const stop = value(watched.watch(path, await stampOf(path), listener))
    // The first look, which compares with what the reader holds, ends before the write
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Act: the check reads the empty file at 60 ms and again at 120 ms, after the text is back
    await writeFile(path, '')
    event('index.ts')
    await new Promise((resolve) => setTimeout(resolve, 90))
    await writeFile(path, 'two\n')

    // Assert
    await vi.waitFor(() => expect(changes).toHaveLength(1))
    expect(changes).toEqual([{ kind: 'changed', stamp: await stampOf(path) }])
    stop()
  })

  it('should report a deletion and then the file showing up again', async () => {
    // Arrange
    const path = join(folder, 'index.ts')
    await writeFile(path, 'one\n')
    const { changes, listener } = collect()
    const stop = value(store().watch(path, await stampOf(path), listener))

    // Act
    await unlink(path)
    await vi.waitFor(() => expect(changes).toEqual([{ kind: 'deleted' }]))
    await writeFile(path, 'back\n')

    // Assert
    await vi.waitFor(() => expect(changes).toHaveLength(2))
    expect(changes[1]).toEqual({ kind: 'changed', stamp: await stampOf(path) })
    stop()
  })

  it('should report a rename away as a deletion', async () => {
    // Arrange
    const path = join(folder, 'index.ts')
    await writeFile(path, 'one\n')
    const { changes, listener } = collect()
    const stop = value(store().watch(path, await stampOf(path), listener))

    // Act
    await rename(path, join(folder, 'moved.ts'))

    // Assert
    await vi.waitFor(() => expect(changes).toEqual([{ kind: 'deleted' }]))
    stop()
  })

  it('should report at once a change made before the watch began when given what the reader holds', async () => {
    // Arrange
    const path = join(folder, 'index.ts')
    await writeFile(path, 'one\n')
    const since = await stampOf(path)
    await writeFile(path, 'two\n')
    const { changes, listener } = collect()

    // Act
    const stop = value(store().watch(path, since, listener))

    // Assert
    await vi.waitFor(() => expect(changes).toHaveLength(1))
    stop()
  })

  it('should report nothing once stopped', async () => {
    // Arrange
    const path = join(folder, 'index.ts')
    await writeFile(path, 'one\n')
    const { changes, listener } = collect()
    const stop = value(store().watch(path, await stampOf(path), listener))

    // Act
    stop()
    await writeFile(path, 'two\n')
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Assert
    expect(changes).toEqual([])
  })

  it('should fail with the watch code when the file does not exist', () => {
    const watched = store().watch(join(folder, 'missing.ts'), undefined, () => undefined)

    expect(watched).toMatchObject({ ok: false, error: { data: { code: 'DCK-FIL-004' } } })
  })
})

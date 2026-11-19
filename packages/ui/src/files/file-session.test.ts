import {
  createFileOpener,
  encodeText,
  type FileStamp,
  type LineEdit,
  type LineRange,
  type TextBase,
} from '@dck/core'
import { MemoryFileStore } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import {
  AUTO_SAVE_MS,
  createFileSession,
  type EditorPort,
  type FileSessionDeps,
} from './file-session.ts'

const PATH = '/home/ana/acme/src/login.ts'

// The editor as plain text: line edits replace whole lines, as the merge gives them
function fakeEditor(initial: string) {
  let text = initial
  const marked: LineRange[][] = []
  const undoable: boolean[] = []
  const editor: EditorPort = {
    text: () => text,
    reload(next, canUndo = false) {
      text = next
      undoable.push(canUndo)
    },
    applyLineEdits(edits: readonly LineEdit[]) {
      const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? []
      for (const edit of [...edits].reverse())
        lines.splice(edit.fromLine, edit.toLine - edit.fromLine, edit.insert)
      text = lines.join('')
    },
    markLines(ranges) {
      marked.push([...ranges])
    },
    ensureFinalNewline() {
      if (text === '' || text.endsWith('\n')) return false
      text += '\n'
      return true
    },
  }
  return {
    editor,
    marked,
    undoable,
    type(next: string) {
      text = next
    },
  }
}

// A clock the test moves by hand
function fakeClock() {
  let tasks: { at: number; task: () => void }[] = []
  let now = 0
  return {
    after(milliseconds: number, task: () => void) {
      const entry = { at: now + milliseconds, task }
      tasks.push(entry)
      return () => {
        tasks = tasks.filter((candidate) => candidate !== entry)
      }
    },
    advance(milliseconds: number) {
      now += milliseconds
      const due = tasks.filter((entry) => entry.at <= now)
      tasks = tasks.filter((entry) => entry.at > now)
      for (const entry of due) entry.task()
    },
  }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

async function setup(text: string, options: { autoSave?: boolean; autoMerge?: boolean } = {}) {
  const store = new MemoryFileStore()
  store.put(PATH, text)
  const opener = createFileOpener({ store, urlOf: () => 'dck-file://open/x' })
  const opened = await opener.open(PATH)
  if (!opened.ok || !('base' in opened.value)) throw new Error('invariant: a text opened')
  const editing = fakeEditor(text)
  const clock = fakeClock()
  let changes = 0
  let reopened = 0
  let slowSave: Promise<void> | undefined
  const files: FileSessionDeps['files'] = {
    open: (path) => opener.open(path),
    async save(path, next, expected) {
      await slowSave
      return store.write(path, encodeText(next, 'utf-8') ?? new Uint8Array(), expected)
    },
  }
  const session = createFileSession({
    path: PATH,
    base: opened.value.base as TextBase,
    readOnly: false,
    editor: editing.editor,
    files,
    autoSave: () => options.autoSave ?? true,
    autoMerge: () => options.autoMerge ?? true,
    after: clock.after,
    onChange: () => void changes++,
    reopen: () => void reopened++,
  })
  const disk = () => new TextDecoder().decode(store.files.get(PATH)?.bytes)
  const writeDisk = (next: string) => {
    store.put(PATH, next)
    return session.diskChanged({ kind: 'changed', stamp: store.stampOf(PATH) as FileStamp })
  }
  return {
    session,
    store,
    editing,
    clock,
    disk,
    writeDisk,
    changes: () => changes,
    reopened: () => reopened,
    slow(until: Promise<void>) {
      slowSave = until
    },
  }
}

const TEXT = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n'

describe('file session saving', () => {
  it('should show the ring at once and save after a pause when the user types', async () => {
    // Arrange
    const { session, editing, clock, disk } = await setup(TEXT)

    // Act
    editing.type(TEXT.replace('two', 'TWO'))
    session.edited()
    const before = session.mark()
    clock.advance(AUTO_SAVE_MS)
    await settled()

    // Assert
    expect(before).toBe('unsaved')
    expect(session.mark()).toBeUndefined()
    expect(disk()).toBe(TEXT.replace('two', 'TWO'))
  })

  it('should keep the ring and write nothing when auto save is off until the user saves', async () => {
    // Arrange
    const { session, editing, clock, disk } = await setup(TEXT, { autoSave: false })
    editing.type(`${TEXT}eleven\n`)
    session.edited()

    // Act
    clock.advance(AUTO_SAVE_MS * 5)
    await session.flush()
    const waited = disk()
    await session.save()

    // Assert
    expect(waited).toBe(TEXT)
    expect(disk()).toBe(`${TEXT}eleven\n`)
    expect(session.mark()).toBeUndefined()
  })

  it('should keep the ring when the user typed again while a save was on its way', async () => {
    // Arrange
    const { session, editing, slow } = await setup(TEXT)
    let release: () => void = () => undefined
    slow(new Promise<void>((resolve) => (release = resolve)))
    editing.type(TEXT.replace('one', 'ONE'))
    session.edited()

    // Act
    const saving = session.save()
    await settled()
    editing.type(TEXT.replace('one', 'ONE!'))
    session.edited()
    release()
    await saving

    // Assert
    expect(session.mark()).toBe('unsaved')
  })

  it('should add the final newline when the editorconfig asks for one', async () => {
    // Arrange
    const { session, editing, disk } = await setup('one\n')
    session.setFinalNewline(true)
    editing.type('one\ntwo')
    session.edited()

    // Act
    await session.save()

    // Assert
    expect(disk()).toBe('one\ntwo\n')
  })
})

describe('file session and the disk', () => {
  it('should reload in place when the disk changed and the user has no edits', async () => {
    // Arrange
    const { session, editing, writeDisk } = await setup(TEXT)

    // Act
    await writeDisk(TEXT.replace('five', 'FIVE'))

    // Assert
    expect(editing.editor.text()).toBe(TEXT.replace('five', 'FIVE'))
    expect(session.mark()).toBeUndefined()
    expect(session.problem()).toBeUndefined()
  })

  it('should ignore a change that only reports what the editor already wrote', async () => {
    // Arrange
    const { session, store, changes } = await setup(TEXT)

    // Act
    await session.diskChanged({ kind: 'changed', stamp: store.stampOf(PATH) as FileStamp })

    // Assert
    expect(changes()).toBe(0)
  })

  it('should merge a disk change on other lines and save the result when the user has edits', async () => {
    // Arrange
    const { session, editing, clock, disk, writeDisk } = await setup(TEXT)
    editing.type(TEXT.replace('two', 'TWO'))
    session.edited()

    // Act
    await writeDisk(TEXT.replace('nine', 'NINE'))
    const problem = session.problem()
    clock.advance(AUTO_SAVE_MS)
    await settled()

    // Assert
    const merged = TEXT.replace('two', 'TWO').replace('nine', 'NINE')
    expect(editing.editor.text()).toBe(merged)
    expect(problem).toMatchObject({ kind: 'merged', fromDisk: [{ from: 8, to: 9 }] })
    expect(disk()).toBe(merged)
  })

  it('should mark the lines from the disk when the user asks to see the merge', async () => {
    // Arrange
    const { session, editing, writeDisk } = await setup(TEXT)
    editing.type(TEXT.replace('two', 'TWO'))
    session.edited()
    await writeDisk(TEXT.replace('nine', 'NINE'))

    // Act
    session.showMerged()

    // Assert
    expect(editing.marked).toEqual([[{ from: 8, to: 9 }]])
  })

  it('should restore the user text and open the conflict when the merge is undone', async () => {
    // Arrange
    const { session, editing, clock, disk, writeDisk } = await setup(TEXT)
    editing.type(TEXT.replace('two', 'TWO'))
    session.edited()
    await writeDisk(TEXT.replace('nine', 'NINE'))

    // Act
    session.undoMerge()
    clock.advance(AUTO_SAVE_MS * 3)
    await settled()

    // Assert
    expect(editing.editor.text()).toBe(TEXT.replace('two', 'TWO'))
    expect(session.problem()).toMatchObject({ kind: 'conflict', reason: undefined })
    expect(session.mark()).toBe('conflict')
    expect(disk()).toBe(TEXT.replace('nine', 'NINE'))
  })

  it('should open the conflict and pause auto save when both changed the same line', async () => {
    // Arrange
    const { session, editing, clock, disk, writeDisk } = await setup(TEXT)
    editing.type(TEXT.replace('two', 'mine'))
    session.edited()

    // Act
    await writeDisk(TEXT.replace('two', 'theirs'))
    clock.advance(AUTO_SAVE_MS * 3)
    await settled()

    // Assert
    expect(session.problem()).toMatchObject({ kind: 'conflict', reason: 'same-lines' })
    expect(session.mark()).toBe('conflict')
    expect(disk()).toBe(TEXT.replace('two', 'theirs'))
  })

  it('should write the user text over the disk when the user keeps theirs', async () => {
    // Arrange
    const { session, editing, clock, disk, writeDisk } = await setup(TEXT)
    editing.type(TEXT.replace('two', 'mine'))
    session.edited()
    await writeDisk(TEXT.replace('two', 'theirs'))

    // Act
    session.keepMine()
    clock.advance(AUTO_SAVE_MS)
    await settled()

    // Assert
    expect(disk()).toBe(TEXT.replace('two', 'mine'))
    expect(session.problem()).toBeUndefined()
  })

  it('should take the disk text as an undoable change when the user reloads', async () => {
    // Arrange
    const { session, editing, writeDisk } = await setup(TEXT, { autoMerge: false })
    editing.type(TEXT.replace('two', 'mine'))
    session.edited()
    await writeDisk(TEXT.replace('nine', 'theirs'))
    const reason = session.problem()

    // Act
    session.reload()

    // Assert
    expect(reason).toMatchObject({ kind: 'conflict', reason: 'merge-off' })
    expect(editing.editor.text()).toBe(TEXT.replace('nine', 'theirs'))
    expect(editing.undoable.at(-1)).toBe(true)
    expect(session.mark()).toBeUndefined()
  })

  it('should offer to save the file again when it was deleted on disk', async () => {
    // Arrange
    const { session, store, disk } = await setup(TEXT)
    store.files.delete(PATH)

    // Act
    await session.diskChanged({ kind: 'deleted' })
    const mark = session.mark()
    await session.saveAgain()

    // Assert
    expect(mark).toBe('deleted')
    expect(disk()).toBe(TEXT)
    expect(session.problem()).toBeUndefined()
  })

  it('should check a change that came during a save once the save has resolved', async () => {
    // Arrange
    const { session, editing, store, disk, slow } = await setup(TEXT)
    let release: () => void = () => undefined
    slow(new Promise<void>((resolve) => (release = resolve)))
    editing.type(TEXT.replace('two', 'TWO'))
    session.edited()
    const saving = session.save()

    // Act: an agent writes another line while the save waits
    store.put(PATH, TEXT.replace('nine', 'NINE'))
    const changed = session.diskChanged({
      kind: 'changed',
      stamp: store.stampOf(PATH) as FileStamp,
    })
    release()
    await saving
    await changed

    // Assert: the save found the disk changed, and the change merged instead of being lost
    expect(editing.editor.text()).toBe(TEXT.replace('two', 'TWO').replace('nine', 'NINE'))
    expect(session.problem()).toMatchObject({ kind: 'merged' })
    expect(disk()).toBe(TEXT.replace('nine', 'NINE'))
  })

  it('should ask for the file to open anew when the disk no longer holds text', async () => {
    // Arrange
    const { session, editing, writeDisk, reopened } = await setup(TEXT)
    editing.type(TEXT.replace('two', 'TWO'))
    session.edited()

    // Act
    await writeDisk('bin\0ary')
    session.reload()

    // Assert
    expect(session.problem()).toMatchObject({ kind: 'conflict', reason: 'not-text' })
    expect(reopened()).toBe(1)
  })
})

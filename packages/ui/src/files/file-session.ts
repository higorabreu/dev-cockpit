import {
  type ConflictReason,
  changeStep,
  type ErrorBody,
  editsByLine,
  errorCodeOf,
  type FileChange,
  type FileStamp,
  type HostApi,
  type LineEdit,
  type LineRange,
  sameContent,
  settleDiskText,
  type TextBase,
} from '@dck/core'

// What the session needs of the editor; the real one is CodeMirror (editor/code-editor.ts)
export interface EditorPort {
  text(): string
  reload(text: string, undoable?: boolean): void
  applyLineEdits(edits: readonly LineEdit[]): void
  markLines(ranges: readonly LineRange[], milliseconds: number): void
  ensureFinalNewline(): boolean
}

export interface DiskText {
  readonly text: string
  readonly stamp: FileStamp
  readonly base: TextBase
}

// What sits in the strip above the text, one at a time
export type FileProblem =
  | {
      readonly kind: 'merged'
      readonly fromDisk: readonly LineRange[]
      // The user's text before the merge, and the base it had, for Undo merge
      readonly mine: string
      readonly before: TextBase
    }
  // `disk` undefined: the disk no longer holds text the editor can take; no reason after Undo merge
  | {
      readonly kind: 'conflict'
      readonly reason: ConflictReason | undefined
      readonly disk: TextBase | undefined
    }
  | { readonly kind: 'deleted' }
  | { readonly kind: 'save-failed'; readonly error: ErrorBody }

// Ring: edits not saved yet. Dot: a conflict with the disk, or the file deleted under the user
export type FileMark = 'unsaved' | 'conflict' | 'deleted' | undefined

export interface FileSessionDeps {
  readonly path: string
  readonly base: TextBase
  readonly readOnly: boolean
  readonly editor: EditorPort
  readonly files: Pick<HostApi['files'], 'open' | 'save'>
  autoSave(): boolean
  autoMerge(): boolean
  after(milliseconds: number, task: () => void): () => void
  // The mark or the strip changed
  onChange(): void
  // The disk's file can only be shown again by opening it anew (it is no longer text)
  reopen(): void
}

// A pause in typing this long saves, as VS Code's afterDelay
export const AUTO_SAVE_MS = 1000
// How long Show keeps the lines a merge took from the disk tinted
export const SHOW_MERGED_MS = 4000

// One open text over a tab: its base (what the disk held when read or written last), its edits, its saves
// and the disk's changes, settled by the core's rules (D81). Saves and changes on disk run one after the
// other, so a change that arrives during a save is checked once the save has resolved
export function createFileSession(deps: FileSessionDeps) {
  const { editor, files, path } = deps
  let base = deps.base
  let dirty = false
  let edits = 0
  let problem: FileProblem | undefined
  let finalNewline = false
  let cancelTimer: (() => void) | undefined
  let queue: Promise<void> = Promise.resolve()
  let disposed = false

  const mark = (): FileMark => {
    if (problem?.kind === 'conflict' || problem?.kind === 'deleted') return problem.kind
    return dirty ? 'unsaved' : undefined
  }
  // Auto save waits while the user decides what to do with the disk's version
  const paused = () => problem?.kind === 'conflict' || problem?.kind === 'deleted'

  function change(next: () => void) {
    const before = [mark(), problem]
    next()
    if (before[0] !== mark() || before[1] !== problem) deps.onChange()
  }

  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task, task)
    return queue
  }

  function stopTimer() {
    cancelTimer?.()
    cancelTimer = undefined
  }

  function schedule() {
    stopTimer()
    if (!deps.autoSave() || paused() || disposed) return
    cancelTimer = deps.after(AUTO_SAVE_MS, () => void save())
  }

  async function write(expected: FileStamp | null) {
    if (finalNewline) editor.ensureFinalNewline()
    const text = editor.text()
    const at = edits
    const result = await files.save(path, text, expected)
    if (!result.ok) {
      change(() => {
        problem = { kind: 'save-failed', error: result.error }
      })
      return
    }
    if (result.value.kind === 'changed') {
      await readDisk()
      return
    }
    const { stamp } = result.value
    change(() => {
      base = { ...base, text, stamp }
      if (at === edits) dirty = false
      if (problem?.kind === 'save-failed' || problem?.kind === 'deleted') problem = undefined
    })
    if (dirty) schedule()
  }

  function save(): Promise<void> {
    stopTimer()
    return enqueue(async () => {
      if (disposed || deps.readOnly || !dirty || paused()) return
      await write(base.stamp)
    })
  }

  // The user's text as the merge sees it: the editor's while it has edits
  const mine = () => (dirty ? editor.text() : base.text)

  function settle(disk: TextBase | undefined) {
    const outcome = settleDiskText({
      base: { text: base.text, encoding: base.encoding },
      mine: mine(),
      disk: disk && { text: disk.text, encoding: disk.encoding },
      autoMerge: deps.autoMerge(),
    })
    if (outcome.kind === 'conflict' || disk === undefined) {
      const reason = outcome.kind === 'conflict' ? outcome.reason : 'not-text'
      change(() => {
        problem = { kind: 'conflict', reason, disk }
      })
      stopTimer()
      return
    }
    if (outcome.kind === 'reload') {
      editor.reload(disk.text)
      change(() => {
        base = disk
        dirty = false
        problem = undefined
      })
      return
    }
    const before = mine()
    editor.applyLineEdits(editsByLine(before, outcome.edits))
    change(() => {
      problem = { kind: 'merged', fromDisk: outcome.fromDisk, mine: before, before: base }
      base = disk
      dirty = true
    })
    schedule()
  }

  async function readDisk() {
    const read = await files.open(path)
    if (disposed) return
    if (!read.ok) {
      change(() => {
        problem =
          errorCodeOf(read.error) === 'DCK-FIL-001'
            ? { kind: 'deleted' }
            : { kind: 'conflict', reason: 'not-text', disk: undefined }
      })
      return
    }
    const opened = read.value
    const disk = 'base' in opened && opened.readOnly === undefined ? opened.base : undefined
    // Our own write, seen before its answer came back
    if (disk && sameContent(disk.stamp, base.stamp)) return
    settle(disk)
  }

  function diskChanged(event: FileChange): Promise<void> {
    return enqueue(async () => {
      if (disposed) return
      const step = changeStep(base.stamp, event)
      if (step === 'ignore') return
      if (step === 'deleted') {
        stopTimer()
        change(() => {
          problem = { kind: 'deleted' }
        })
        return
      }
      await readDisk()
    })
  }

  return {
    path,
    mark,
    problem: () => problem,
    isDirty: () => dirty,
    base: () => base,
    // `.editorconfig`'s insert_final_newline, read after the file opened
    setFinalNewline(value: boolean) {
      finalNewline = value
    },
    // The user typed: the ring shows at once, and a pause saves
    edited() {
      edits++
      change(() => {
        dirty = true
      })
      schedule()
    },
    save,
    // Leaving the file (the terminal, another tab, a hidden window, a closing tab) saves when auto save is on
    flush: (): Promise<void> => (deps.autoSave() ? save() : queue),
    diskChanged,
    // The disk's version over the user's; Ctrl+Z brings the user's back
    reload() {
      if (problem?.kind !== 'conflict') return
      const { disk } = problem
      if (disk === undefined) {
        deps.reopen()
        return
      }
      editor.reload(disk.text, true)
      change(() => {
        base = disk
        dirty = false
        problem = undefined
      })
    },
    // The user's version over the disk's: the next save writes it over what the disk holds now
    keepMine() {
      if (problem?.kind !== 'conflict' || problem.disk === undefined) return
      const { disk } = problem
      change(() => {
        base = disk
        dirty = true
        problem = undefined
      })
      schedule()
    },
    undoMerge() {
      if (problem?.kind !== 'merged') return
      const { mine: text, before } = problem
      const disk = base
      editor.reload(text)
      change(() => {
        base = before
        dirty = true
        problem = { kind: 'conflict', reason: undefined, disk }
      })
      stopTimer()
    },
    showMerged() {
      if (problem?.kind === 'merged') editor.markLines(problem.fromDisk, SHOW_MERGED_MS)
    },
    dismiss() {
      if (problem?.kind === 'merged' || problem?.kind === 'save-failed')
        change(() => {
          problem = undefined
        })
    },
    // Deleted on disk: write the user's text there again, as a new file
    saveAgain(): Promise<void> {
      return enqueue(async () => {
        if (problem?.kind === 'deleted') await write(null)
      })
    },
    retry: () => save(),
    // The two sides of a conflict for Compare
    compare: () =>
      problem?.kind === 'conflict' && problem.disk
        ? { disk: problem.disk.text, mine: editor.text() }
        : undefined,
    dispose() {
      disposed = true
      stopTimer()
    },
  }
}

export type FileSession = ReturnType<typeof createFileSession>

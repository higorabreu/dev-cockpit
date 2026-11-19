import {
  editorConfigFor,
  errorCodeOf,
  FILE_LIMITS,
  type FileChange,
  type HostApi,
  mediaTypeOf,
  type OpenedFile,
  rememberFile,
  type Translator,
} from '@dck/core'
import type { CodeEditor, CodeEditorOptions } from '../editor/code-editor.ts'
import { h } from '../panel/dom.ts'
import { sizeText } from '../review/file-head.ts'
import { type ImageTexts, showImage, type ZoomStep } from '../viewers/image-view.ts'
import { createMergePicker, type MergePicker } from '../viewers/merge-picker.ts'
import { showPdf } from '../viewers/pdf-view.ts'
import { editorPhrases, goToTexts, searchTexts } from './editor-texts.ts'
import { createFileModes, type FileModes } from './file-modes.ts'
import { createFileSession, type FileMark, type FileSession } from './file-session.ts'
import { createStrip } from './file-strip.ts'
import { createFileView, type FileHead, type FileNote, type FileView } from './file-view.ts'
import { fileName, pathParts } from './path-parts.ts'

// The part of the editor's module the view uses; loaded with a dynamic import on the first file opened,
// so nothing of CodeMirror loads with the cockpit
export interface EditorModule {
  createCodeEditor(options: CodeEditorOptions): CodeEditor
  // A Markdown preview's code block in the editor's colors
  highlightCode(code: string, language: string): Promise<DocumentFragment | undefined>
}

// What the tab bar draws of a tab's file (the appendix)
export interface FileAppendix {
  readonly name: string
  readonly path: string
  readonly shown: boolean
  readonly mark: FileMark
}

export type LeaveAnswer = 'save' | 'discard' | 'cancel'

// How long a quit waits for the pending saves before it goes on
export const QUIT_SAVE_MS = 2000

export interface QuitSteps {
  // The user is about to be asked about a file: the host shows the window and waits without a limit
  asking(): void
  // Brings the tab forward, its file on screen
  reveal(tabId: string): void
}

export interface FileTabsDeps {
  readonly api: Pick<HostApi, 'files' | 'paths' | 'external'>
  readonly i18n: Translator
  readonly mac: boolean
  // The editor's own keys as this keyboard writes them, for the header's tooltips
  readonly editorKeys: {
    readonly find: string
    readonly goToLine: string
    // Compare's Done (Ctrl+Enter, ⌘Enter)
    readonly done: string
  }
  // The tab's own element, which the file covers
  host(tabId: string): HTMLElement | undefined
  // The tab's folder, for the header's path
  cwd(tabId: string): string | undefined
  autoSave(): boolean
  autoMerge(): boolean
  // With auto save off, a file with edits about to close or be replaced: save, discard or cancel
  ask(tabId: string, name: string): Promise<LeaveAnswer>
  // The appendix, its mark or the recent list changed
  onChange(): void
  focusTerminal(tabId: string): void
  loadEditor(): Promise<EditorModule>
  after(milliseconds: number, task: () => void): () => void
}

interface Entry {
  readonly path: string
  shown: boolean
  // Restored from the last run: the path only, read when it first shows
  pending: boolean
  view?: FileView
  head?: FileHead
  session?: FileSession
  editor?: CodeEditor
  editorHost?: HTMLElement
  // An image or a PDF shown in place of the editor
  viewer?: { focus(): void; destroy(): void; zoom?(step: ZoomStep): void }
  // A Markdown file's preview or an SVG's image beside its editor
  modes?: FileModes
  // Compare on a conflict: the three versions to pick from
  picker?: MergePicker
  opened?: OpenedFile
  watching?: boolean
}

const noteOf = (file: OpenedFile): FileNote | undefined => {
  if (!('base' in file)) return undefined
  if (file.readOnly) return { kind: 'read-only', reason: file.readOnly }
  return file.size > FILE_LIMITS.colorBytes ? { kind: 'no-colors' } : undefined
}

// One file at a time over each tab (plans/files.md, "Where"): opened, shown and hidden over its terminal,
// saved when the user leaves it, and followed on disk. `openFile` is the single way in, for the file
// search, a Ctrl+click on a path and the review alike
export function createFileTabs(deps: FileTabsDeps) {
  const { api, i18n } = deps
  const t = i18n.t
  const entries = new Map<string, Entry>()
  const recents = new Map<string, readonly string[]>()

  api.files.onChange((path: string, change: FileChange) => {
    for (const entry of entries.values())
      if (entry.path === path && entry.session) void entry.session.diskChanged(change)
  })

  function limitText(note: FileNote | undefined) {
    const bytes = note?.kind === 'no-colors' ? FILE_LIMITS.colorBytes : FILE_LIMITS.editableBytes
    return sizeText(i18n, bytes)
  }

  function renderHead(entry: Entry) {
    if (!entry.view || !entry.head) return
    // Find and Go to line only while the editor shows
    const editing = entry.head.editing && entry.modes?.mode() !== 'rendered' && !entry.picker
    entry.view.renderHead({ ...entry.head, editing }, limitText(entry.head.note))
  }

  function closeCompare(entry: Entry) {
    entry.picker?.destroy()
    entry.picker = undefined
    entry.view?.body.removeAttribute('data-picking')
  }

  const imageTexts = (path: string): ImageTexts => ({
    zoomIn: t('files.image.zoomIn'),
    zoomOut: t('files.image.zoomOut'),
    fit: t('files.image.fit'),
    actual: t('files.image.actual'),
    image: t('files.image.label', { name: fileName(path) }),
  })

  function renderStrip(tabId: string, entry: Entry) {
    const problem = entry.session?.problem()
    if (problem?.kind !== 'conflict') closeCompare(entry)
    if (!entry.view) return
    const session = entry.session
    entry.view.setStrip(
      problem && session
        ? createStrip(
            problem,
            t,
            {
              showMerged: () => session.showMerged(),
              undoMerge: () => session.undoMerge(),
              dismiss: () => session.dismiss(),
              reload: () => session.reload(),
              keepMine: () => session.keepMine(),
              compare: () => void toggleCompare(tabId, entry),
              saveAgain: () => void session.saveAgain(),
              closeFile: () => void closeFile(tabId),
              retry: () => void session.retry(),
            },
            entry.picker !== undefined,
          )
        : undefined,
    )
  }

  // Compare: the three versions with a choice per conflict; Done puts the result in the editor
  function toggleCompare(tabId: string, entry: Entry) {
    if (entry.picker) {
      closeCompare(entry)
      renderStrip(tabId, entry)
      renderHead(entry)
      entry.editor?.focus()
      return
    }
    const versions = entry.session?.compare()
    const file = entry.opened
    if (!versions || !file || !('base' in file) || !entry.view) return
    const session = entry.session
    const back = () => {
      closeCompare(entry)
      renderStrip(tabId, entry)
      renderHead(entry)
      entry.editor?.focus()
    }
    entry.view.body.setAttribute('data-picking', '')
    entry.picker = createMergePicker({
      parent: entry.view.body,
      ...versions,
      lineBreak: file.base.lineEnding === 'crlf' ? '\r\n' : '\n',
      doneKey: deps.editorKeys.done,
      texts: {
        mine: t('files.compare.mine'),
        disk: t('files.compare.disk'),
        useMine: t('files.merge.useMine'),
        useDisk: t('files.merge.useDisk'),
        useBoth: t('files.merge.useBoth'),
        done: t('files.merge.done'),
        cancel: t('files.merge.cancel'),
        next: t('files.merge.next'),
        previous: t('files.merge.previous'),
        label: t('files.merge.label'),
        conflict: (index, total) => t('files.merge.conflict', { index, total }),
        chosen: (choice) => t(`files.merge.chosen.${choice}`),
        left: (count) => t('files.merge.left', { count }),
        unchanged: (count) => t('files.merge.unchanged', { count }),
      },
      done(text) {
        closeCompare(entry)
        session?.resolve(text)
        renderHead(entry)
        entry.editor?.focus()
      },
      cancel: back,
    })
    renderStrip(tabId, entry)
    renderHead(entry)
    entry.picker.focus()
  }

  function dispose(entry: Entry) {
    closeCompare(entry)
    const drawn = entry.viewer !== undefined || entry.modes !== undefined
    entry.viewer?.destroy()
    entry.modes?.destroy()
    // What Chromium decoded for an image, an SVG or a preview's pictures goes with them
    if (drawn) api.files.clearImageCache()
    if (entry.opened?.kind === 'markdown') api.files.release(entry.path)
    entry.session?.dispose()
    entry.editor?.destroy()
    entry.view?.dispose()
    if (entry.watching) api.files.unwatch(entry.path)
  }

  async function mountEditor(
    tabId: string,
    entry: Entry,
    file: OpenedFile,
    line?: number,
    column?: number,
  ) {
    if (!('base' in file) || !entry.view) return
    const [module, configs] = await Promise.all([
      deps.loadEditor(),
      api.files.editorConfig(file.path),
    ])
    if (entries.get(tabId) !== entry) return
    const config = editorConfigFor(file.path, configs)
    const readOnly = file.readOnly !== undefined
    const editorHost = h('div', { class: 'fv-editor' })
    entry.view.body.replaceChildren(editorHost)
    const editor = module.createCodeEditor({
      parent: editorHost,
      path: file.path,
      text: file.base.text,
      lineEnding: file.base.lineEnding,
      readOnly,
      colors: file.size <= FILE_LIMITS.colorBytes,
      config,
      mac: deps.mac,
      label: t('files.a11y.editor', { name: fileName(file.path) }),
      phrases: editorPhrases(t),
      searchTexts: () => searchTexts(t),
      goToTexts: () => goToTexts(t),
      onUserChange: () => entry.session?.edited(),
      onTextChange: () => entry.modes?.textChanged(),
      onSave: () => void entry.session?.save(),
    })
    const session = createFileSession({
      path: file.path,
      base: file.base,
      readOnly,
      editor,
      files: api.files,
      autoSave: deps.autoSave,
      autoMerge: deps.autoMerge,
      after: deps.after,
      onChange() {
        renderStrip(tabId, entry)
        deps.onChange()
        // A save or a reload: an SVG's image shows what the disk now holds
        const stamp = session.base().stamp.hash
        if (stamp !== drawnStamp) {
          drawnStamp = stamp
          entry.modes?.saved()
        }
      },
      reopen: () => void load(tabId, file.path),
    })
    let drawnStamp = file.base.stamp.hash
    session.setFinalNewline(config.insertFinalNewline === true)
    Object.assign(entry, { editor, editorHost, session })
    mountModes(tabId, entry, file, module)
    const watched = await api.files.watch(file.path, file.base.stamp)
    entry.watching = watched.ok
    if (line !== undefined) editor.goToLine(line, column)
    if (entry.shown) focusEntry(entry)
  }

  // A Markdown file's preview (up to FILE_LIMITS.previewBytes) or an SVG's image beside the editor
  function mountModes(
    tabId: string,
    entry: Entry,
    file: Extract<OpenedFile, { base: unknown }>,
    module: EditorModule,
  ) {
    const { view, editor, editorHost, session } = entry
    if (!view || !editor || !editorHost || !session) return
    const svg = file.kind === 'text' && file.url !== undefined
    if (file.kind === 'markdown' && file.size > FILE_LIMITS.previewBytes) {
      view.setInfo(t('files.markdown.tooLarge', { size: sizeText(i18n, FILE_LIMITS.previewBytes) }))
      return
    }
    if (file.kind !== 'markdown' && !svg) return
    entry.modes = createFileModes({
      kind: svg ? 'svg' : 'markdown',
      path: file.path,
      t,
      body: view.body,
      editorHost,
      editor,
      ...(svg && file.url ? { url: file.url } : {}),
      imageTexts: imageTexts(file.path),
      assets: (paths) => api.files.assets(file.path, paths),
      highlight: module.highlightCode,
      openLink: (url) => api.external.openLink(url),
      openFile: (path, line) => void openFile(tabId, path, line),
      flush: () => session.flush(),
      onChange: () => renderHead(entry),
    })
    view.tools.replaceChildren(entry.modes.tools)
    renderHead(entry)
  }

  // An image drawn from its bitmap, with its zoom in the header, or the card past FILE_LIMITS.imagePixels
  async function mountImage(entry: Entry, file: Extract<OpenedFile, { kind: 'image' }>) {
    const view = entry.view
    if (!view) return
    const loaded = await showImage({
      parent: view.body,
      url: file.url,
      vector: false,
      texts: imageTexts(file.path),
      bytes: () => api.files.bytes(file.path),
      type: mediaTypeOf(file.path),
    })
    if (entry.view !== view || !view.element.isConnected) {
      if (loaded.kind === 'shown') loaded.view.destroy()
      return
    }
    if (loaded.kind === 'failed') {
      view.showMessage(t('files.image.failed'))
      return
    }
    const { width, height } = loaded.kind === 'shown' ? loaded.view.size : loaded.size
    const size = t('files.image.size', { width, height })
    const parts = [size, sizeText(i18n, file.size), file.animated && t('files.image.firstFrame')]
    view.setInfo(parts.filter(Boolean).join(' · '))
    if (loaded.kind === 'too-large') {
      view.showCard(file, t('files.image.tooLarge', { width, height }))
      return
    }
    entry.viewer = loaded.view
    // An animation shows its first frame here; the system's app plays it
    const play = h('button', { type: 'button', class: 'fv-link' }, t('files.openExternal'))
    play.addEventListener('click', () => api.paths.openFile(file.path))
    view.tools.replaceChildren(...(file.animated ? [play] : []), loaded.view.tools)
    if (entry.shown) loaded.view.focus()
  }

  // Reads the file and shows it over the tab, in place of the one there
  async function load(tabId: string, path: string, line?: number, column?: number) {
    const host = deps.host(tabId)
    if (!host) return
    const opened = await api.files.open(path)
    const previous = entries.get(tabId)
    if (previous) dispose(previous)
    const view = createFileView(host, {
      i18n,
      showTerminal: () => show(tabId, false),
      openExternal: (file) => api.paths.openFile(file),
      find: () => entries.get(tabId)?.editor?.find(),
      goToLine: () => entries.get(tabId)?.editor?.askLine(),
      keys: deps.editorKeys,
    })
    const entry: Entry = { path, shown: true, pending: false, view }
    entries.set(tabId, entry)
    recents.set(tabId, rememberFile(recents.get(tabId) ?? [], path))
    entry.head = {
      path,
      editing: opened.ok && 'base' in opened.value,
      parts: pathParts(path, deps.cwd(tabId)),
      ignored: false,
      note: opened.ok ? noteOf(opened.value) : undefined,
    }
    renderHead(entry)
    view.setShown(true)
    deps.onChange()
    void api.files.ignored(path).then((ignored) => {
      if (!ignored || entries.get(tabId) !== entry || !entry.head) return
      entry.head = { ...entry.head, ignored }
      renderHead(entry)
    })
    if (!opened.ok) {
      view.showMessage(t('files.gone', { error: t(`error.${errorCodeOf(opened.error)}`) }))
      return
    }
    entry.opened = opened.value
    const file = opened.value
    if (file.kind === 'text' || file.kind === 'markdown')
      await mountEditor(tabId, entry, file, line, column)
    else if (file.kind === 'image') await mountImage(entry, file)
    else if (file.kind === 'pdf') {
      view.setInfo(sizeText(i18n, file.size))
      entry.viewer = showPdf(view.body, file.url, t('files.pdf.label', { name: fileName(path) }))
    } else view.showCard(file)
  }

  // With auto save on the edits are written; off, or when the disk is in conflict, the user is asked.
  // False when the user cancelled or the save did not go through
  async function leave(tabId: string, entry: Entry): Promise<boolean> {
    const session = entry.session
    if (!session?.isDirty()) return true
    if (deps.autoSave() && session.mark() === 'unsaved') {
      await session.flush()
      if (!session.isDirty()) return true
    }
    const answer = await deps.ask(tabId, fileName(entry.path))
    if (answer === 'cancel') return false
    if (answer === 'discard') return true
    await session.save()
    return !session.isDirty()
  }

  function show(tabId: string, shown: boolean) {
    const entry = entries.get(tabId)
    if (!entry) return
    if (shown && entry.pending) {
      void load(tabId, entry.path)
      return
    }
    entry.shown = shown
    entry.view?.setShown(shown)
    if (shown) focusEntry(entry)
    else {
      // Going back to the terminal saves first, so the agent and the shell see the file as typed
      void entry.session?.flush()
      deps.focusTerminal(tabId)
    }
    deps.onChange()
  }

  // The keys go to what the file shows: Compare, the image, the PDF, the preview, else the editor
  function focusEntry(entry: Entry) {
    if (entry.picker) entry.picker.focus()
    else if (entry.viewer) entry.viewer.focus()
    else if (!entry.modes?.focus()) entry.editor?.focus()
  }

  // A line and a column from 1, as a compiler or the review names them
  async function openFile(tabId: string, path: string, line?: number, column?: number) {
    const entry = entries.get(tabId)
    if (entry?.path === path && !entry.pending) {
      show(tabId, true)
      if (line !== undefined) entry.editor?.goToLine(line, column)
      return
    }
    if (entry && !(await leave(tabId, entry))) return
    await load(tabId, path, line, column)
  }

  async function closeFile(tabId: string): Promise<boolean> {
    const entry = entries.get(tabId)
    if (!entry) return true
    if (!(await leave(tabId, entry))) return false
    dispose(entry)
    entries.delete(tabId)
    deps.onChange()
    deps.focusTerminal(tabId)
    return true
  }

  // A file the disk took away from the user's edits: a conflict, a deletion or a save that failed
  const needsDecision = (session: FileSession) => {
    const kind = session.problem()?.kind
    return (
      session.isDirty() && (kind === 'conflict' || kind === 'deleted' || kind === 'save-failed')
    )
  }

  function reveal(tabId: string, steps: QuitSteps) {
    steps.reveal(tabId)
    show(tabId, true)
  }

  return {
    // Before the app quits: the pending saves are written within QUIT_SAVE_MS through the usual check; a
    // file in conflict shows its strip and keeps the app open; with auto save off each file with edits
    // asks Save, Don't save or Cancel. True lets the app quit
    async beforeQuit(steps: QuitSteps): Promise<boolean> {
      const sessions = [...entries].flatMap(([tabId, entry]) =>
        entry.session ? [[tabId, entry, entry.session] as const] : [],
      )
      let stop: () => void = () => undefined
      const limit = new Promise<void>((resolve) => {
        stop = deps.after(QUIT_SAVE_MS, resolve)
      })
      await Promise.race([Promise.all(sessions.map(([, , session]) => session.flush())), limit])
      stop()
      const blocked = sessions.find(([, , session]) => needsDecision(session))
      let asked = false
      const ask = () => {
        if (!asked) steps.asking()
        asked = true
      }
      if (blocked) {
        ask()
        reveal(blocked[0], steps)
        return false
      }
      for (const [tabId, entry, session] of sessions) {
        if (!session.isDirty()) continue
        ask()
        reveal(tabId, steps)
        if (!(await leave(tabId, entry))) return false
      }
      return true
    },
    openFile,
    show,
    // The toggle key, the header's button, the menus: between the terminal (with its review) and the file
    toggle(tabId: string) {
      const entry = entries.get(tabId)
      if (entry) show(tabId, !entry.shown)
    },
    has: (tabId: string) => entries.has(tabId),
    isShown: (tabId: string) => entries.get(tabId)?.shown === true,
    appendix(tabId: string): FileAppendix | undefined {
      const entry = entries.get(tabId)
      if (!entry) return undefined
      return {
        name: fileName(entry.path),
        path: entry.path,
        shown: entry.shown,
        mark: entry.session?.mark(),
      }
    },
    // The keys go to the file when it shows; false when the tab's panes should take them
    focus(tabId: string): boolean {
      const entry = entries.get(tabId)
      if (!entry?.shown) return false
      if (entry.editor || entry.viewer) focusEntry(entry)
      else entry.view?.element.focus()
      return true
    },
    // The font keys zoom an image that shows; false leaves them to the terminal's font
    zoom(tabId: string, step: ZoomStep): boolean {
      const entry = entries.get(tabId)
      if (!entry?.shown) return false
      if (entry.viewer?.zoom) {
        entry.viewer.zoom(step)
        return true
      }
      return entry.modes?.zoom(step) ?? false
    },
    // The preview key: a Markdown file between its text and its preview, an SVG between image and code
    togglePreview(tabId: string) {
      const entry = entries.get(tabId)
      if (entry?.shown && !entry.picker) void entry.modes?.toggle()
    },
    // Leaving the tab or hiding the window saves what auto save would
    flush(tabId: string) {
      void entries.get(tabId)?.session?.flush()
    },
    flushAll() {
      for (const entry of entries.values()) void entry.session?.flush()
    },
    closeFile,
    // Ctrl+S and the segment's menu: written now, whatever auto save says
    save(tabId: string) {
      void entries.get(tabId)?.session?.save()
    },
    // Before the tab closes: false keeps it open
    confirmClose(tabId: string): Promise<boolean> {
      const entry = entries.get(tabId)
      return entry ? leave(tabId, entry) : Promise.resolve(true)
    },
    forget(tabId: string) {
      const entry = entries.get(tabId)
      if (entry) dispose(entry)
      entries.delete(tabId)
      recents.delete(tabId)
    },
    recent: (tabId: string): readonly string[] => recents.get(tabId) ?? [],
    // What the next start opens again: the file over the tab and the recent list, paths only
    saved(tabId: string) {
      return { file: entries.get(tabId)?.path, recent: recents.get(tabId) ?? [] }
    },
    // From the last run: the file comes back over the tab if it still opens, read again when it shows
    async restore(tabId: string, file: string | undefined, recent: readonly string[]) {
      if (recent.length > 0) recents.set(tabId, recent)
      if (file === undefined) return
      const opened = await api.files.open(file)
      if (!opened.ok || entries.has(tabId)) return
      entries.set(tabId, { path: file, shown: false, pending: true })
      deps.onChange()
    },
    retranslate() {
      for (const [tabId, entry] of entries) {
        renderHead(entry)
        renderStrip(tabId, entry)
      }
    },
  }
}

export type FileTabs = ReturnType<typeof createFileTabs>

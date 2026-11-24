// @vitest-environment happy-dom
import {
  createFileOpener,
  createTranslator,
  defaultSettings,
  encodeText,
  FILE_LIMITS,
  type FileChange,
  type FileStamp,
  type HostApi,
  ok,
} from '@dck/core'
import { MemoryFileStore } from '@dck/core/testing'
import { afterEach, describe, expect, it } from 'vitest'
import type { CodeEditor, CodeEditorOptions } from '../editor/code-editor.ts'
import { autoSaveOf } from '../settings/settings-file-tab.ts'
import { createFileTabs, type FileTabsDeps, type LeaveAnswer } from './file-tabs.ts'

const ROOT = '/home/ana/acme'
const LOGIN = `${ROOT}/src/login.ts`
const NOTES = `${ROOT}/notes.md`
const SETTINGS = '/home/ana/.config/dck/settings.json'

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

// CodeMirror as plain text: what the controller hands it and what the user types into it
function fakeEditors() {
  const made: { options: CodeEditorOptions; editor: CodeEditor; type(text: string): void }[] = []
  // Where each go to line put the cursor: the line and the column
  const places: (readonly [number, number | undefined])[] = []
  return {
    made,
    places,
    module: {
      createCodeEditor(options: CodeEditorOptions): CodeEditor {
        let text = options.text
        const editor: CodeEditor = {
          text: () => text,
          focus: () => undefined,
          hasFocus: () => false,
          reload(next) {
            text = next
          },
          applyLineEdits: () => undefined,
          markLines: () => undefined,
          goToLine: (line, column) => void places.push([line, column]),
          topLine: () => 1,
          scrollToLine: () => undefined,
          ensureFinalNewline: () => false,
          setReadOnly: () => undefined,
          find: () => undefined,
          askLine: () => undefined,
          destroy: () => undefined,
        }
        made.push({
          options,
          editor,
          type(next) {
            text = next
            options.onUserChange()
            options.onTextChange?.()
          },
        })
        return editor
      },
      highlightCode: async () => undefined,
    },
  }
}

function setup(options: { autoSave?: boolean; answer?: LeaveAnswer } = {}) {
  const settings = {
    current: () => ({
      ...defaultSettings,
      files: { ...defaultSettings.files, autoSave: options.autoSave ?? true },
    }),
    path: () => SETTINGS,
  }
  const store = new MemoryFileStore()
  store.put(LOGIN, 'export const a = 1\n')
  store.put(NOTES, '# Notes\n')
  store.put(SETTINGS, '{}\n')
  store.put(`${ROOT}/.env`, 'TOKEN=x\n')
  store.put(`${ROOT}/logo.bin`, new Uint8Array([1, 0, 2]))
  store.put(`${ROOT}/.editorconfig`, '[*.ts]\nindent_style = space\nindent_size = 4\n')
  const opener = createFileOpener({ store, urlOf: () => 'dck-file://open/x' })
  const listeners: ((path: string, change: FileChange) => void)[] = []
  const opened: string[] = []
  const released: string[] = []
  const links: string[] = []
  const files: HostApi['files'] = {
    pathOf: () => '',
    open: (path) => opener.open(path),
    save: (path, text, expected) =>
      store.write(path, encodeText(text, 'utf-8') ?? new Uint8Array(), expected),
    watch: async () => ok(null),
    unwatch: () => undefined,
    onChange(listener) {
      listeners.push(listener)
      return () => undefined
    },
    async editorConfig(path) {
      return path.startsWith(ROOT) ? [{ dir: ROOT, text: '[*.ts]\nindent_size = 4\n' }] : []
    },
    ignored: async (path) => path.endsWith('.env'),
    assets: async (_document, paths) => paths.map(() => null),
    release: (document) => void released.push(document),
    bytes: async () => undefined,
    clearImageCache: () => undefined,
  }
  const host = document.createElement('div')
  document.body.append(host)
  const editors = fakeEditors()
  const asked: string[] = []
  const terminals: string[] = []
  let changes = 0
  const deps: FileTabsDeps = {
    api: {
      files,
      paths: { openFile: (path: string) => void opened.push(path) } as HostApi['paths'],
      external: { open: () => undefined, openLink: (url: string) => void links.push(url) },
    },
    i18n: createTranslator('en'),
    mac: false,
    editorKeys: { find: 'Ctrl+F', goToLine: 'Ctrl+G', done: 'Ctrl+Enter' },
    host: () => host,
    cwd: () => ROOT,
    autoSave: autoSaveOf(settings, () => '/home/ana/.config/dck/themes'),
    autoMerge: () => true,
    async ask(_tabId, name) {
      asked.push(name)
      return options.answer ?? 'cancel'
    },
    onChange: () => void changes++,
    focusTerminal: (tabId) => void terminals.push(tabId),
    loadEditor: async () => editors.module,
    after: () => () => undefined,
  }
  const tabs = createFileTabs(deps)
  const disk = (path: string) => new TextDecoder().decode(store.files.get(path)?.bytes)
  const emit = (path: string, change: FileChange) => {
    for (const listener of listeners) listener(path, change)
  }
  return {
    tabs,
    host,
    store,
    editors,
    asked,
    terminals,
    disk,
    emit,
    opened,
    released,
    links,
    changes: () => changes,
  }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('file tabs', () => {
  it('should show the file over the tab with its path and editorconfig when it opens', async () => {
    // Arrange
    const { tabs, host, editors } = setup()

    // Act
    await tabs.openFile('tab-1', LOGIN)

    // Assert
    expect(tabs.appendix('tab-1')).toEqual({
      name: 'login.ts',
      path: LOGIN,
      shown: true,
      mark: undefined,
    })
    expect(host.hasAttribute('data-file-shown')).toBe(true)
    expect(host.querySelector('.fv-folders')?.textContent).toBe('acme / src / ')
    expect(host.querySelector('.fv-name')?.textContent).toBe('login.ts')
    expect(editors.made[0]?.options.config).toEqual({ indentSize: 4, tabWidth: 4 })
    expect(editors.made[0]?.options.colors).toBe(true)
  })

  it('should put the cursor on the line and column when a path names them', async () => {
    // Arrange
    const { tabs, editors } = setup()

    // Act
    await tabs.openFile('tab-1', LOGIN, 12, 5)
    await tabs.openFile('tab-1', LOGIN, 3)

    // Assert
    expect(editors.places).toEqual([
      [12, 5],
      [3, undefined],
    ])
  })

  it('should save first and give the keys to the terminal when the user switches to it', async () => {
    // Arrange
    const { tabs, editors, disk, terminals, host } = setup()
    await tabs.openFile('tab-1', LOGIN)
    editors.made[0]?.type('export const a = 2\n')
    const mark = tabs.appendix('tab-1')?.mark

    // Act
    tabs.toggle('tab-1')
    await settled()

    // Assert
    expect(mark).toBe('unsaved')
    expect(tabs.isShown('tab-1')).toBe(false)
    expect(host.hasAttribute('data-file-shown')).toBe(false)
    expect(disk(LOGIN)).toBe('export const a = 2\n')
    expect(terminals).toEqual(['tab-1'])
    expect(tabs.appendix('tab-1')?.mark).toBeUndefined()
  })

  it('should keep settings.json unsaved until Ctrl+S when auto save is on while another file still saves', async () => {
    // Arrange
    const { tabs, editors, disk, asked } = setup({ answer: 'cancel' })
    await tabs.openFile('tab-1', SETTINGS)
    editors.made[0]?.type('{ "theme": "li\n')
    await tabs.openFile('tab-2', LOGIN)
    editors.made[1]?.type('export const a = 2\n')

    // Act
    tabs.toggle('tab-1')
    tabs.toggle('tab-2')
    await settled()
    const kept = await tabs.confirmClose('tab-1')
    const unsaved = { disk: disk(SETTINGS), mark: tabs.appendix('tab-1')?.mark }
    tabs.save('tab-1')
    await settled()

    // Assert
    expect(unsaved).toEqual({ disk: '{}\n', mark: 'unsaved' })
    expect(kept).toBe(false)
    expect(asked).toEqual(['settings.json'])
    expect(disk(LOGIN)).toBe('export const a = 2\n')
    expect(tabs.appendix('tab-2')?.mark).toBeUndefined()
    expect(disk(SETTINGS)).toBe('{ "theme": "li\n')
    expect(tabs.appendix('tab-1')?.mark).toBeUndefined()
  })

  it('should show the file again without reading it when the toggle comes back', async () => {
    const { tabs, store } = setup()
    await tabs.openFile('tab-1', LOGIN)
    tabs.toggle('tab-1')
    const reads = store.calls.filter((call) => call === `read ${LOGIN}`).length

    tabs.toggle('tab-1')

    expect(tabs.isShown('tab-1')).toBe(true)
    expect(store.calls.filter((call) => call === `read ${LOGIN}`).length).toBe(reads)
  })

  it('should ask before replacing a file with edits when auto save is off and keep it on cancel', async () => {
    // Arrange
    const { tabs, editors, asked } = setup({ autoSave: false, answer: 'cancel' })
    await tabs.openFile('tab-1', LOGIN)
    editors.made[0]?.type('changed\n')

    // Act
    await tabs.openFile('tab-1', NOTES)

    // Assert
    expect(asked).toEqual(['login.ts'])
    expect(tabs.appendix('tab-1')?.path).toBe(LOGIN)
  })

  it('should save and open the next file when the user answers save', async () => {
    // Arrange
    const { tabs, editors, disk } = setup({ autoSave: false, answer: 'save' })
    await tabs.openFile('tab-1', LOGIN)
    editors.made[0]?.type('saved\n')

    // Act
    await tabs.openFile('tab-1', NOTES)

    // Assert
    expect(disk(LOGIN)).toBe('saved\n')
    expect(tabs.appendix('tab-1')?.path).toBe(NOTES)
    expect(tabs.recent('tab-1')).toEqual([NOTES, LOGIN])
  })

  it('should keep the tab open when the user cancels closing it with edits', async () => {
    const { tabs, editors } = setup({ autoSave: false, answer: 'cancel' })
    await tabs.openFile('tab-1', LOGIN)
    editors.made[0]?.type('changed\n')

    expect(await tabs.confirmClose('tab-1')).toBe(false)
  })

  it('should offer the editor search and go to line with their keys in the header of a text', async () => {
    const { tabs, host } = setup()

    await tabs.openFile('tab-1', LOGIN)

    const tools = [...host.querySelectorAll('.fv-head .fv-icon')].map((button) => [
      button.getAttribute('data-tip'),
      button.getAttribute('data-tip-key') ?? button.getAttribute('data-tip-shortcut'),
    ])
    expect(tools).toEqual([
      ['Find', 'Ctrl+F'],
      ['Go to line', 'Ctrl+G'],
      ['Show terminal', 'toggleFile'],
    ])
  })

  it('should show a card with the kind and the size when the file is not text', async () => {
    const { tabs, host, editors } = setup()

    await tabs.openFile('tab-1', `${ROOT}/logo.bin`)

    expect(host.querySelector('.fv-card-kind')?.textContent).toBe('Binary file, 3 B')
    expect(host.querySelector('.fv-link')).not.toBeNull()
    expect(editors.made).toHaveLength(0)
  })

  it('should say Ignored by git in the header when git ignores the file', async () => {
    const { tabs, host } = setup()

    await tabs.openFile('tab-1', `${ROOT}/.env`)
    await settled()

    expect(host.querySelector('.fv-flag')?.textContent).toBe('Ignored by git')
  })

  it('should open a large text without colors and say so in the header', async () => {
    // Arrange
    const { tabs, host, store, editors } = setup()
    const big = `${ROOT}/big.ts`
    store.put(big, 'x'.repeat(FILE_LIMITS.colorBytes + 1))

    // Act
    await tabs.openFile('tab-1', big)

    // Assert
    expect(editors.made[0]?.options.colors).toBe(false)
    expect(host.querySelector('.fv-note')?.textContent).toBe('No syntax colors over 2 MB')
  })

  it('should reload the file in place when the disk changes and the user has no edits', async () => {
    // Arrange
    const { tabs, store, editors, emit } = setup()
    await tabs.openFile('tab-1', LOGIN)
    store.put(LOGIN, 'export const a = 3\n')

    // Act
    emit(LOGIN, { kind: 'changed', stamp: store.stampOf(LOGIN) as FileStamp })
    await settled()
    await settled()

    // Assert
    expect(editors.made[0]?.editor.text()).toBe('export const a = 3\n')
  })

  it('should bring a file back over a restored tab and read it only when it shows', async () => {
    // Arrange
    const { tabs, editors } = setup()

    // Act
    await tabs.restore('tab-1', LOGIN, [LOGIN, NOTES])
    const before = { appendix: tabs.appendix('tab-1'), editors: editors.made.length }
    tabs.show('tab-1', true)
    await settled()
    await settled()

    // Assert
    expect(before).toEqual({
      appendix: { name: 'login.ts', path: LOGIN, shown: false, mark: undefined },
      editors: 0,
    })
    expect(tabs.isShown('tab-1')).toBe(true)
    expect(editors.made).toHaveLength(1)
    expect(tabs.recent('tab-1')).toEqual([LOGIN, NOTES])
  })

  it('should leave a restored tab without a file when the file is gone', async () => {
    const { tabs } = setup()

    await tabs.restore('tab-1', `${ROOT}/gone.ts`, [])

    expect(tabs.has('tab-1')).toBe(false)
  })
})

describe('file tabs before the app quits', () => {
  const steps = () => {
    const events: string[] = []
    return {
      events,
      asking: () => void events.push('asking'),
      reveal: (tabId: string) => void events.push(`reveal ${tabId}`),
    }
  }

  it('should write the pending auto save and let the app quit without asking', async () => {
    // Arrange
    const { tabs, editors, disk, asked } = setup()
    await tabs.openFile('tab-1', LOGIN)
    editors.made[0]?.type('export const a = 9\n')
    const quit = steps()

    // Act
    const allowed = await tabs.beforeQuit(quit)

    // Assert
    expect(allowed).toBe(true)
    expect(disk(LOGIN)).toBe('export const a = 9\n')
    expect(quit.events).toEqual([])
    expect(asked).toEqual([])
  })

  it('should ask about a file with edits when auto save is off and stay on cancel', async () => {
    // Arrange
    const { tabs, editors, asked } = setup({ autoSave: false, answer: 'cancel' })
    await tabs.openFile('tab-1', LOGIN)
    tabs.show('tab-1', false)
    editors.made[0]?.type('changed\n')
    const quit = steps()

    // Act
    const allowed = await tabs.beforeQuit(quit)

    // Assert
    expect(allowed).toBe(false)
    expect(quit.events).toEqual(['asking', 'reveal tab-1'])
    expect(tabs.isShown('tab-1')).toBe(true)
    expect(asked).toEqual(['login.ts'])
  })

  it('should save the file and quit when the user answers save', async () => {
    const { tabs, editors, disk } = setup({ autoSave: false, answer: 'save' })
    await tabs.openFile('tab-1', LOGIN)
    editors.made[0]?.type('kept\n')

    const allowed = await tabs.beforeQuit(steps())

    expect(allowed).toBe(true)
    expect(disk(LOGIN)).toBe('kept\n')
  })

  it('should quit without writing when the user answers do not save', async () => {
    const { tabs, editors, disk } = setup({ autoSave: false, answer: 'discard' })
    await tabs.openFile('tab-1', LOGIN)
    editors.made[0]?.type('dropped\n')

    const allowed = await tabs.beforeQuit(steps())

    expect(allowed).toBe(true)
    expect(disk(LOGIN)).toBe('export const a = 1\n')
  })

  it('should show the conflict and stay open when the save meets a change on disk', async () => {
    // Arrange
    const { tabs, editors, store, disk, asked, host } = setup()
    await tabs.openFile('tab-1', LOGIN)
    tabs.show('tab-1', false)
    editors.made[0]?.type('export const a = 2\n')
    store.put(LOGIN, 'export const a = 3\n')
    const quit = steps()

    // Act
    const allowed = await tabs.beforeQuit(quit)

    // Assert
    expect(allowed).toBe(false)
    expect(quit.events).toEqual(['asking', 'reveal tab-1'])
    expect(tabs.appendix('tab-1')?.mark).toBe('conflict')
    expect(tabs.isShown('tab-1')).toBe(true)
    expect(host.querySelector('.fv-strip')?.textContent).toContain('This file changed on disk')
    expect(disk(LOGIN)).toBe('export const a = 3\n')
    expect(asked).toEqual([])
  })

  it('should show Edit, Preview and Side by side for a Markdown file and switch with the preview key', async () => {
    // Arrange
    const { tabs, host } = setup()
    await tabs.openFile('tab-1', NOTES)
    const pressed = () =>
      [...host.querySelectorAll('.fv-mode')].map((button) => [
        button.textContent,
        button.getAttribute('aria-pressed'),
      ])

    // Act
    const before = pressed()
    tabs.togglePreview('tab-1')
    await settled()

    // Assert
    expect(before).toEqual([
      ['Edit', 'true'],
      ['Preview', 'false'],
      ['Side by side', 'false'],
    ])
    expect(pressed()[1]).toEqual(['Preview', 'true'])
    expect(host.querySelector('.fv-body')?.getAttribute('data-mode')).toBe('rendered')
    expect(host.querySelector('.fv-head [data-tip="Find"]')).toBeNull()
  })

  it('should keep a Markdown file past the preview limit in the editor and say so', async () => {
    // Arrange
    const { tabs, host, store } = setup()
    const big = `${ROOT}/CHANGELOG.md`
    store.put(big, '# Log\n'.repeat(FILE_LIMITS.previewBytes / 6 + 1))

    // Act
    await tabs.openFile('tab-1', big)
    tabs.togglePreview('tab-1')

    // Assert
    expect(host.querySelector('.fv-mode')).toBeNull()
    expect(host.querySelector('.fv-info')?.textContent).toBe('Preview up to 200 KB')
    expect(host.querySelector('.fv-body')?.hasAttribute('data-mode')).toBe(false)
  })

  it('should stop serving a Markdown file images when the file closes', async () => {
    const { tabs, released } = setup()
    await tabs.openFile('tab-1', NOTES)

    await tabs.closeFile('tab-1')

    expect(released).toEqual([NOTES])
  })

  it('should open an SVG as its image with a Code button that switches to the editor', async () => {
    // Arrange
    const { tabs, host, store, editors } = setup()
    const logo = `${ROOT}/logo.svg`
    store.put(logo, '<svg xmlns="http://www.w3.org/2000/svg"/>')
    await tabs.openFile('tab-1', logo)
    const code = host.querySelector('.fv-mode')

    // Act
    const before = host.querySelector('.fv-body')?.getAttribute('data-mode')
    tabs.togglePreview('tab-1')
    await settled()

    // Assert
    expect(before).toBe('rendered')
    expect(code?.textContent).toBe('Code')
    expect(code?.getAttribute('data-tip-shortcut')).toBe('filePreview')
    expect(code?.getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('.fv-body')?.getAttribute('data-mode')).toBe('source')
    expect(editors.made).toHaveLength(1)
  })

  it('should show a PDF in a frame from the file protocol with its size in the header', async () => {
    const { tabs, host, store } = setup()
    store.put(`${ROOT}/manual.pdf`, '%PDF-1.7')

    await tabs.openFile('tab-1', `${ROOT}/manual.pdf`)

    expect(host.querySelector('iframe.pdf-view')?.getAttribute('src')).toBe('dck-file://open/x')
    expect(host.querySelector('.fv-info')?.textContent).toBe('8 B')
  })

  it('should put the picked versions in the editor and settle the conflict when Compare is done', async () => {
    // Arrange
    const { tabs, editors, store, emit, host } = setup({ autoSave: false })
    await tabs.openFile('tab-1', LOGIN)
    editors.made[0]?.type('export const a = 2\n')
    store.put(LOGIN, 'export const a = 3\n')
    emit(LOGIN, { kind: 'changed', stamp: store.stampOf(LOGIN) as FileStamp })
    await settled()
    await settled()
    const compare = [...host.querySelectorAll<HTMLButtonElement>('.fv-strip .fv-action')].find(
      (button) => button.textContent === 'Compare',
    )

    // Act
    compare?.click()
    const useDisk = [...host.querySelectorAll<HTMLButtonElement>('.mp-conflict .fv-action')].find(
      (button) => button.textContent === 'Use disk',
    )
    useDisk?.click()
    host.querySelector<HTMLButtonElement>('.mp-bar .fv-action.primary')?.click()

    // Assert
    expect(editors.made[0]?.editor.text()).toBe('export const a = 3\n')
    expect(host.querySelector('.merge-picker')).toBeNull()
    expect(tabs.appendix('tab-1')?.mark).toBe('unsaved')
  })
})

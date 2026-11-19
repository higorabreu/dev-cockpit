// @vitest-environment happy-dom
import {
  createFileOpener,
  createTranslator,
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
import { createFileTabs, type FileTabsDeps, type LeaveAnswer } from './file-tabs.ts'

const ROOT = '/home/ana/acme'
const LOGIN = `${ROOT}/src/login.ts`
const NOTES = `${ROOT}/notes.md`

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

// CodeMirror as plain text: what the controller hands it and what the user types into it
function fakeEditors() {
  const made: { options: CodeEditorOptions; editor: CodeEditor; type(text: string): void }[] = []
  return {
    made,
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
          goToLine: () => undefined,
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
          },
        })
        return editor
      },
      createCompare: () => ({ destroy: () => undefined }),
    },
  }
}

function setup(options: { autoSave?: boolean; answer?: LeaveAnswer } = {}) {
  const store = new MemoryFileStore()
  store.put(LOGIN, 'export const a = 1\n')
  store.put(NOTES, '# Notes\n')
  store.put(`${ROOT}/.env`, 'TOKEN=x\n')
  store.put(`${ROOT}/logo.bin`, new Uint8Array([1, 0, 2]))
  store.put(`${ROOT}/.editorconfig`, '[*.ts]\nindent_style = space\nindent_size = 4\n')
  const opener = createFileOpener({ store, urlOf: () => 'dck-file://open/x' })
  const listeners: ((path: string, change: FileChange) => void)[] = []
  const opened: string[] = []
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
    },
    i18n: createTranslator('en'),
    mac: false,
    editorKeys: { find: 'Ctrl+F', goToLine: 'Ctrl+G' },
    host: () => host,
    cwd: () => ROOT,
    autoSave: () => options.autoSave ?? true,
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

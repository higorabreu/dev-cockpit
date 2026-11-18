// @vitest-environment happy-dom
import {
  createTranslator,
  type DiffFile,
  type DiffModule,
  orderModuleFiles,
  parseUnifiedDiff,
} from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createFileList } from './file-list.ts'
import { commitsTip, cutSubject } from './module-row.ts'

const changed = (path: string, module?: string): DiffFile => {
  const [file] = parseUnifiedDiff(
    [`diff --git a/${path} b/${path}`, '--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b', ''].join(
      '\n',
    ),
  )
  if (!file) throw new Error('invariant: one file')
  return module === undefined ? { ...file, path } : { ...file, path, module }
}

const modules: DiffModule[] = [
  {
    path: 'libs/lib',
    commits: ['Fix the parser', 'Add a fallback', 'Rename the helper', 'Drop the export'],
    commitCount: 4,
  },
  { path: 'libs/lib/vendor/deep', commits: [], commitCount: 0 },
  { path: 'libs/other', commits: [], commitCount: 0 },
]

const files = orderModuleFiles(
  [
    changed('app.ts'),
    changed('libs/lib/src/util.ts', 'libs/lib'),
    changed('libs/lib/vendor/deep/src/deep.txt', 'libs/lib/vendor/deep'),
    changed('libs/other/docs/guide.md', 'libs/other'),
  ],
  modules,
)

function setup() {
  const selected: number[] = []
  const list = createFileList({
    id: 'review-tab-1',
    i18n: createTranslator('en'),
    onSelect: (index) => selected.push(index),
    onOpen: () => undefined,
    onLoad: () => undefined,
    isViewed: () => false,
  })
  document.body.append(list.element)
  list.show(files, modules, 0)
  const rows = () =>
    [...list.element.querySelectorAll<HTMLElement>('.rv-file')].map((row) =>
      row.classList.contains('rv-module')
        ? `${row.getAttribute('aria-level')} [${row.querySelector('.rv-mod-path')?.textContent}] ${row.getAttribute('aria-expanded')}`
        : `${row.getAttribute('aria-level')} ${row.querySelector('.rv-path')?.textContent}`,
    )
  const key = (name: string) =>
    list.element.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
  return { list, selected, rows, key }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('createFileList', () => {
  it('should group the files of each submodule under its header with paths inside it', () => {
    const { rows } = setup()

    expect(rows()).toEqual([
      '1 app.ts',
      '1 [libs/lib] true',
      '2 src/util.ts',
      '2 [vendor/deep] true',
      '3 src/deep.txt',
      '1 [libs/other] true',
      '2 docs/guide.md',
    ])
  })

  it('should show the tag, the file count and up to three commit subjects in the header', () => {
    const { list } = setup()

    const header = list.element.querySelector('[data-module="libs/lib"]')

    expect(header?.querySelector('.rv-tag')?.textContent).toBe('Submodule')
    expect(header?.querySelector('.rv-mod-count')?.textContent).toBe('2')
    expect(header?.querySelector('.rv-mod-count')?.getAttribute('data-tip')).toBe('2 changed files')
    expect(header?.querySelector('.rv-mod-subjects')?.textContent).toBe(
      'Fix the parser · Add a fallback · Rename the helper',
    )
    expect(header?.querySelector('.rv-mod-more')?.textContent).toBe('+ 1 commit')
    expect(header?.getAttribute('aria-label')).toBe(
      'Submodule libs/lib, 2 changed files, 4 new commits',
    )
  })

  it('should fold a group with a click and open it again with the right arrow', () => {
    // Arrange
    const { list, rows, key } = setup()

    // Act
    list.element.querySelector<HTMLElement>('[data-module="libs/lib"]')?.click()
    const folded = rows()
    key('ArrowRight')

    // Assert
    expect(folded).toEqual([
      '1 app.ts',
      '1 [libs/lib] false',
      '1 [libs/other] true',
      '2 docs/guide.md',
    ])
    expect(rows()).toHaveLength(7)
  })

  it('should fold with the left arrow and climb from a file to the header that holds it', () => {
    // Arrange
    const { list, rows, key, selected } = setup()
    list.select(2)

    // Act
    key('ArrowLeft')
    const climbed = list.element
      .querySelector('[aria-selected="true"]')
      ?.getAttribute('data-module')
    key('ArrowLeft')

    // Assert
    expect(climbed).toBe('libs/lib/vendor/deep')
    expect(rows()[3]).toBe('2 [vendor/deep] false')
    expect(selected).toEqual([2])
  })

  it('should take the diff to the first file of a group when the cursor lands on its header', () => {
    const { key, selected } = setup()

    key('ArrowDown')

    expect(selected).toEqual([1])
  })

  it('should stand on the folded header when the diff reaches a file it hides', () => {
    // Arrange
    const { list, key } = setup()
    key('ArrowDown')
    key('Enter')

    // Act
    list.highlight(2)

    // Assert
    expect(list.element.querySelector('[aria-selected="true"]')?.getAttribute('data-module')).toBe(
      'libs/lib',
    )
    expect(list.selectedFile()).toBeUndefined()
  })

  it('should open a folded group and stand on its header when asked for a submodule', () => {
    // Arrange
    const { list, selected } = setup()
    list.element.querySelector<HTMLElement>('[data-module="libs/lib"]')?.click()

    // Act
    const found = list.showModule('libs/lib/vendor/deep')
    const missing = list.showModule('libs/gone')

    // Assert
    expect(found).toBe(true)
    expect(missing).toBe(false)
    expect(list.element.querySelector('[aria-selected="true"]')?.getAttribute('data-module')).toBe(
      'libs/lib/vendor/deep',
    )
    expect(selected.at(-1)).toBe(2)
  })
})

describe('commitsTip', () => {
  it('should list one cut line per commit, at most five, then how many more', () => {
    // Arrange
    const long = 'Move the cache warm-up behind a flag so cold starts stay under two seconds'
    const module: DiffModule = {
      path: 'libs/lib',
      commits: [long, ...Array.from({ length: 9 }, (_, index) => `Commit ${index + 2}`)],
      commitCount: 14,
    }

    // Act
    const lines = commitsTip(module, createTranslator('en')).split('\n')

    // Assert
    expect(lines).toHaveLength(6)
    expect(lines[0]).toBe('Move the cache warm-up behind a flag so cold starts stay…')
    expect(lines[0]?.length).toBeLessThanOrEqual(60)
    expect(lines[5]).toBe('+ 9 more')
  })

  it('should keep a short subject whole', () => {
    expect(cutSubject('Fix the parser')).toBe('Fix the parser')
  })
})

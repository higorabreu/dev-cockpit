// @vitest-environment happy-dom
import { createTranslator, type FileListing, type WalkResult } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createKeymap } from '../platform/keymap.ts'
import { createFileRanker } from './file-ranker.ts'
import { createFileSearch } from './file-search.ts'

const repository: FileListing = {
  kind: 'git',
  root: '/home/ana/acme',
  files: ['src/app.ts', 'src/environment.ts', 'README.md'],
  ignored: ['.env', '.env.local', 'dist/', 'node_modules/'],
  truncated: false,
  partial: false,
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

// The search over a fake host, ranking in the window
function setUp(
  listing: FileListing = repository,
  steps: Record<string, WalkResult> = {},
  othersReady: Promise<void> = Promise.resolve(),
) {
  document.body.replaceChildren()
  const overlay = document.createElement('div')
  const box = document.createElement('div')
  const input = document.createElement('input')
  const results = document.createElement('div')
  const hint = document.createElement('div')
  box.append(input, results, hint)
  overlay.append(box)
  document.body.append(overlay)
  const picked: string[] = []
  const expanded: string[] = []
  let closed = 0
  const search = createFileSearch(
    { overlay, input, results, hint },
    {
      list: async () => ({ ...listing, ignored: [], partial: listing.kind === 'git' }),
      others: async () => {
        await othersReady
        return { files: ['src/cart/discounts.ts'], ignored: listing.ignored, truncated: false }
      },
      expand: async (_root, folder) => {
        expanded.push(folder)
        return steps[folder] ?? { entries: [], truncated: false }
      },
      ranker: createFileRanker(() => undefined),
      onPick: (root, path) => picked.push(`${root}|${path}`),
      onClose: () => {
        closed += 1
      },
      i18n: createTranslator('en'),
      keymap: createKeymap('pc'),
    },
  )
  const type = async (text: string) => {
    input.value = text
    input.dispatchEvent(new Event('input'))
    await settle()
  }
  const press = (key: string) =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  const names = () =>
    [...results.querySelectorAll('[role="option"] .l')].map((name) => name.textContent)
  return {
    search,
    overlay,
    results,
    hint,
    input,
    picked,
    expanded,
    closed: () => closed,
    type,
    press,
    names,
  }
}

describe('file search', () => {
  it('should list the project files and offer the ignored ones by key when it opens', async () => {
    // Arrange
    const { search, names, hint, overlay } = setUp()

    // Act
    await search.open(Promise.resolve('/home/ana/acme/src'), () => [])
    await settle()

    // Assert
    expect(overlay.classList.contains('open')).toBe(true)
    expect(names()).toEqual(['app.ts', 'environment.ts', 'README.md', 'discounts.ts'])
    expect(hint.textContent).toBe('Ctrl+Shift+O include ignored')
  })

  it('should show the ignored files apart with their mark when the query finds them', async () => {
    // Arrange
    const { search, results, type, names } = setUp()
    await search.open(Promise.resolve('/home/ana/acme'), () => [])

    // Act
    await type('env')

    // Assert
    expect(names()).toEqual(['environment.ts', '.env', '.env.local'])
    expect(results.querySelector('.fgroup')?.textContent).toBe('Ignored by git')
    const marked = [...results.querySelectorAll('[aria-description="Ignored by git"]')]
    expect(marked).toHaveLength(2)
  })

  it('should say it includes the ignored files and list them all when the key is pressed again', async () => {
    // Arrange
    const { search, overlay, names, hint } = setUp()
    await search.open(Promise.resolve('/home/ana/acme'), () => [])
    await settle()

    // Act
    search.toggleWiden()
    await settle()

    // Assert
    expect(overlay.querySelector('.fwide')?.hasAttribute('hidden')).toBe(false)
    expect(overlay.querySelector('.fwide')?.textContent).toBe('Including ignored')
    expect(names()).toEqual([
      'app.ts',
      'environment.ts',
      'README.md',
      'discounts.ts',
      '.env',
      '.env.local',
      'dist/',
      'node_modules/',
    ])
    expect(hint.textContent).toBe('Ctrl+Shift+O project files only')
  })

  it('should step into a closed folder and list its inside when its row is picked', async () => {
    // Arrange
    const inside = {
      entries: ['node_modules/react/index.js', 'node_modules/react/cjs/'],
      truncated: false,
    }
    const { search, type, press, input, expanded, names, results, picked } = setUp(repository, {
      'node_modules/': inside,
    })
    await search.open(Promise.resolve('/home/ana/acme'), () => [])
    await type('modules')

    // Act
    press('Enter')
    await settle()
    await settle()

    // Assert
    expect(input.value).toBe('node_modules/')
    expect(expanded).toEqual(['node_modules/'])
    expect(names()).toEqual(['index.js', 'cjs/'])
    expect(results.querySelector('.fgroup')?.textContent).toBe('node_modules/ · Ignored by git')
    expect(picked).toEqual([])
  })

  it('should give the root and the path and close when a file is chosen with Enter', async () => {
    // Arrange
    const { search, type, press, picked, overlay, closed } = setUp()
    await search.open(Promise.resolve('/home/ana/acme'), () => [])
    await type('app')

    // Act
    press('Enter')

    // Assert
    expect(picked).toEqual(['/home/ana/acme|src/app.ts'])
    expect(overlay.classList.contains('open')).toBe(false)
    expect(closed()).toBe(1)
  })

  it('should move the choice with the arrows when they are pressed', async () => {
    // Arrange
    const { search, press, picked } = setUp()
    await search.open(Promise.resolve('/home/ana/acme'), () => [])
    await settle()

    // Act
    press('ArrowDown')
    press('Enter')

    // Assert
    expect(picked).toEqual(['/home/ana/acme|src/environment.ts'])
  })

  it('should widen when the row that counts the other ignored files is clicked', async () => {
    // Arrange
    const many: FileListing = {
      ...repository,
      files: ['scripts/build.ts'],
      ignored: Array.from({ length: 7 }, (_, index) => `logs/build-${index}.log`),
    }
    const { search, type, results, names } = setUp(many)
    await search.open(Promise.resolve('/home/ana/acme'), () => [])
    await type('build')
    const more = results.querySelector<HTMLElement>('.fmore')

    // Act
    more?.click()
    await settle()

    // Assert
    expect(more?.textContent).toBe('2 more')
    expect(more?.getAttribute('data-tip-shortcut')).toBe('fileSearch')
    expect(names()).toHaveLength(8)
  })

  it('should say the tab has no folder when there is none to list', async () => {
    // Arrange
    const { search, results, hint } = setUp()

    // Act
    await search.open(Promise.resolve(undefined), () => [])

    // Assert
    expect(results.textContent).toBe('This tab has no folder to search')
    expect(hint.hidden).toBe(true)
  })

  it('should show one list without the key to widen when the folder is outside a repository', async () => {
    // Arrange
    const folder: FileListing = {
      kind: 'folder',
      root: '/home/ana/notes',
      files: ['plan.md'],
      ignored: [],
      truncated: true,
      partial: false,
    }
    const { search, results, hint, names } = setUp(folder)

    // Act
    await search.open(Promise.resolve('/home/ana/notes'), () => [])
    await settle()

    // Assert
    expect(names()).toEqual(['plan.md'])
    expect(hint.hidden).toBe(true)
    expect(results.querySelector('.fnote')?.textContent).toBe('Only the first 1 files are listed')
  })

  it('should close and forget the list when Esc is pressed', async () => {
    // Arrange
    const { search, press, overlay, results } = setUp()
    await search.open(Promise.resolve('/home/ana/acme'), () => [])

    // Act
    press('Escape')

    // Assert
    expect(overlay.classList.contains('open')).toBe(false)
    expect(results.children).toHaveLength(0)
  })

  it('should list the recent files first when the query is empty', async () => {
    // Arrange
    const { search, names } = setUp()

    // Act
    await search.open(Promise.resolve('/home/ana/acme'), () => ['README.md'])
    await settle()

    // Assert
    expect(names()).toEqual(['README.md', 'app.ts', 'environment.ts', 'discounts.ts'])
  })

  it('should show the tracked files at once and add the others when the tree has been walked', async () => {
    // Arrange
    let walked: () => void = () => undefined
    const later = new Promise<void>((resolve) => {
      walked = resolve
    })
    const { search, type, names } = setUp(repository, {}, later)
    const opening = search.open(Promise.resolve('/home/ana/acme'), () => [])
    await type('env')
    const before = names()

    // Act
    walked()
    await opening
    await settle()

    // Assert
    expect(before).toEqual(['environment.ts'])
    expect(names()).toEqual(['environment.ts', '.env', '.env.local'])
  })
})

// @vitest-environment happy-dom
import {
  type BranchInfo,
  createTranslator,
  type DiffOutcome,
  type DiffRequest,
  type ErrorBody,
  errorBody,
  fail,
  type HostApi,
  ok,
  parseUnifiedDiff,
  type Result,
  reviewDiff,
} from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createReviewPane } from './review-pane.ts'

const diffText = (from: number, to: number) =>
  [
    'diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts',
    '--- a/src/billing/invoice.ts',
    '+++ b/src/billing/invoice.ts',
    '@@ -10,3 +10,3 @@ export function total(invoice: Invoice) {',
    ' const base = 1',
    `-const timeout = ${from}`,
    `+const timeout = ${to}`,
    ' return base',
    '',
  ].join('\n')

const lockText = [
  'diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml',
  '--- a/pnpm-lock.yaml',
  '+++ b/pnpm-lock.yaml',
  '@@ -1 +1,2 @@',
  ' lockfileVersion: 9.0',
  '+importers: {}',
  '',
].join('\n')

// A feature branch created from origin/develop, with main as the other base
const feature: BranchInfo = {
  base: { name: 'origin/develop', source: 'created' },
  found: { name: 'origin/develop', source: 'created' },
  candidates: ['main', 'origin/develop'],
  onBase: false,
  upstream: undefined,
}

const repository = (text = diffText(3000, 5000) + lockText, branch: BranchInfo = feature) =>
  ok({
    kind: 'ok' as const,
    diff: reviewDiff(
      '/home/ana/acme',
      'uncommitted',
      branch,
      parseUnifiedDiff(text)
        .map((file) =>
          file.path === 'src/billing/invoice.ts' ? { ...file, newLineCount: 20 } : file,
        )
        .sort((a, b) => a.path.localeCompare(b.path)),
    ),
  })

type Answer = Result<DiffOutcome, ErrorBody>

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))

function setup(answer: Answer | (() => Answer), cwd: string | undefined = '/home/ana/acme') {
  const requests: DiffRequest[] = []
  const reads: string[] = []
  let escapes = 0
  let closes = 0
  let layouts = 0
  const memory = { indexHidden: false }
  const bases = new Map<string, string>()
  const api = {
    review: {
      diff: async (request: DiffRequest) => {
        requests.push(request)
        return typeof answer === 'function' ? answer() : answer
      },
      fileLines: async (root: string, path: string) => {
        reads.push(`${root}|${path}`)
        return ok(Array.from({ length: 20 }, (_, index) => `text ${index + 1}`))
      },
    },
    paths: { openFile: () => undefined },
  } as unknown as HostApi
  const pane = createReviewPane({
    id: 'review-tab-1',
    api,
    i18n: createTranslator('en'),
    memory,
    modifier: 'Ctrl',
    isModified: (event) => event.ctrlKey,
    cwd: async () => cwd,
    baseFor: () => bases.get('/home/ana/acme'),
    chooseBase: async (root, name) => {
      if (name === undefined) bases.delete(root)
      else bases.set(root, name)
    },
    onEscape: () => {
      escapes += 1
    },
    onClose: () => {
      closes += 1
    },
    onToggleLayout: () => {
      layouts += 1
    },
  })
  document.body.append(pane.element)
  return {
    pane,
    requests,
    reads,
    escapes: () => escapes,
    closes: () => closes,
    layouts: () => layouts,
    memory,
    bases,
    text: (selector: string) => pane.element.querySelector(selector)?.textContent ?? '',
    labels: (selector: string) =>
      [...pane.element.querySelectorAll(selector)].map((row) => row.getAttribute('aria-label')),
    key: (target: Element, key: string, extra: KeyboardEventInit = {}) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra })),
  }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('createReviewPane', () => {
  it('should read nothing until the review is opened', async () => {
    const { requests } = setup(repository())

    await flush()

    expect(requests).toEqual([])
  })

  it('should list the changed files with their state and counts when the repository has changes', async () => {
    const { pane, requests, labels, text } = setup(repository())

    pane.open()
    await flush()

    expect(requests).toEqual([
      { cwd: '/home/ana/acme', scope: 'uncommitted', ignoreWhitespace: false },
    ])
    expect(labels('.rv-file')).toEqual([
      'pnpm-lock.yaml, modified, 1 added, 0 removed',
      'src/billing/invoice.ts, modified, 1 added, 1 removed',
    ])
    expect(text('.rv-totals')).toBe('2 files+2−1')
    expect(text('.rv-head .select-value [data-current]')).toBe('Uncommitted')
  })

  it('should show every file in one scroll with its header and keep a generated file collapsed until asked', async () => {
    const { pane, labels } = setup(repository())
    pane.open()
    await flush()

    const headers = labels('.rv-filerow')
    pane.element.querySelector<HTMLButtonElement>('.rv-filerow .rv-show')?.click()

    expect(headers).toEqual([
      'pnpm-lock.yaml, modified, 1 added, 0 removed. Generated file, collapsed. Enter loads the diff.',
      'src/billing/invoice.ts, modified, 1 added, 1 removed',
    ])
    expect(pane.element.querySelector('.rv-show')).toBeNull()
    expect(pane.element.querySelectorAll('.rv-row[data-kind]').length).toBe(6)
  })

  it('should group the rows of each file under its name for a screen reader', async () => {
    const { pane } = setup(repository())
    pane.open()
    await flush()

    const groups = [...pane.element.querySelectorAll('.rv-lines [role="group"]')].map((group) => [
      group.getAttribute('aria-label')?.split(',')[0],
      group.querySelectorAll('[role="option"]').length,
    ])

    expect(groups).toEqual([
      ['pnpm-lock.yaml', 1],
      ['src/billing/invoice.ts', 8],
    ])
  })

  it('should number both sides, sign the changes and mark the changed word in a sticky gutter', async () => {
    const { pane, labels } = setup(repository())
    pane.open()
    await flush()

    const rows = [...pane.element.querySelectorAll('.rv-row[data-kind]')].map((row) => [
      row.getAttribute('data-kind'),
      [...row.querySelectorAll('.rv-gutter .rv-num')].map((cell) => cell.textContent),
      row.querySelector('.rv-gutter .rv-sign')?.textContent,
      [...row.querySelectorAll('.rv-word')].map((mark) => mark.textContent),
    ])
    expect(rows).toEqual([
      ['context', ['10', '10'], '', []],
      ['remove', ['11', ''], '−', ['3000']],
      ['add', ['', '11'], '+', ['5000']],
      ['context', ['12', '12'], '', []],
    ])
    expect(labels('.rv-row[data-kind]')).toContain('Removed, line 11: const timeout = 3000')
    expect(labels('.rv-hunk')).toEqual([
      'Hunk at line 10, in export function total(invoice: Invoice) {',
    ])
    expect(pane.element.querySelector('.rv-hunk .rv-band')).not.toBeNull()
  })

  it('should show the unchanged lines from the working tree when a collapsed gap is expanded', async () => {
    const { pane, reads, labels } = setup(repository())
    pane.open()
    await flush()

    expect(labels('.rv-expand')).toEqual(['Expand 9 lines', 'Expand 8 lines'])
    pane.element.querySelector<HTMLElement>('.rv-expand')?.click()
    await flush()

    expect(reads).toEqual(['/home/ana/acme|src/billing/invoice.ts'])
    expect(labels('.rv-expand')).toEqual(['Expand 8 lines'])
    expect(labels('.rv-row[data-kind="context"]')[0]).toBe('Line 1: text 1')
  })

  it('should cross files with n and p and land on file headers with ] and [', async () => {
    const { pane, key } = setup(repository())
    pane.open()
    await flush()
    pane.element.querySelector<HTMLButtonElement>('.rv-show')?.click()
    const lines = pane.element.querySelector('.rv-lines') as HTMLElement
    const active = () => lines.getAttribute('aria-activedescendant')
    const current = () =>
      pane.element.querySelector('.rv-file[aria-selected="true"]')?.getAttribute('aria-label')
    lines.focus()

    key(lines, 'n')
    const lockHunk = active()
    key(lines, 'n')
    const invoiceHunk = [active(), current()]
    key(lines, 'p')
    const back = [active(), current()]
    key(lines, ']')
    const nextFile = active()
    key(lines, '[')

    expect(lockHunk).toBe('review-tab-1-row-1')
    expect(invoiceHunk).toEqual([
      'review-tab-1-row-6',
      'src/billing/invoice.ts, modified, 1 added, 1 removed',
    ])
    expect(back).toEqual(['review-tab-1-row-1', 'pnpm-lock.yaml, modified, 1 added, 0 removed'])
    expect(nextFile).toBe('review-tab-1-row-4')
    expect(active()).toBe('review-tab-1-row-0')
  })

  it('should keep the keys on the diff when ] lands on a collapsed file and show it with Enter', async () => {
    const big = Array.from({ length: 2600 }, (_, index) => `+line ${index}`)
    const text = [
      diffText(3000, 5000),
      'diff --git a/z-data.csv b/z-data.csv',
      '--- a/z-data.csv',
      '+++ b/z-data.csv',
      '@@ -0,0 +1,2600 @@',
      ...big,
      '',
    ].join('\n')
    const { pane, key, escapes } = setup(repository(text))
    pane.open()
    await flush()
    const lines = pane.element.querySelector('.rv-lines') as HTMLElement
    lines.focus()

    key(lines, ']')
    const onCollapsed = [
      document.activeElement === lines,
      lines.getAttribute('aria-activedescendant'),
    ]
    key(lines, 'Enter')
    key(lines, 'Escape')

    expect(onCollapsed).toEqual([true, 'review-tab-1-row-8'])
    expect(document.activeElement).toBe(lines)
    expect(pane.element.querySelector('.rv-show')).toBeNull()
    expect(escapes()).toBe(1)
  })

  it('should scroll the diff to a file when it is picked in the index and give it the keys on Enter', async () => {
    const { pane, key } = setup(repository())
    pane.open()
    await flush()
    const index = pane.element.querySelector('.rv-files') as HTMLElement
    const lines = pane.element.querySelector('.rv-lines') as HTMLElement

    pane.element.querySelector<HTMLElement>('.rv-file[data-index="1"]')?.click()
    const afterClick = lines.getAttribute('aria-activedescendant')
    index.focus()
    key(index, 'ArrowUp')
    const afterArrow = lines.getAttribute('aria-activedescendant')
    key(index, 'Enter')

    expect(afterClick).toBe('review-tab-1-row-1')
    expect(afterArrow).toBe('review-tab-1-row-0')
    expect(document.activeElement).toBe(lines)
  })

  it('should highlight in the index the file at the top of the diff when it is scrolled by hand', async () => {
    const { pane } = setup(repository())
    pane.open()
    await flush()
    const lines = pane.element.querySelector('.rv-lines') as HTMLElement
    const current = () =>
      pane.element.querySelector('.rv-file[aria-selected="true"]')?.getAttribute('aria-label')
    const before = current()

    lines.scrollTop = 60
    lines.dispatchEvent(new Event('scroll'))
    await frame()

    expect(before).toBe('pnpm-lock.yaml, modified, 1 added, 0 removed')
    expect(current()).toBe('src/billing/invoice.ts, modified, 1 added, 1 removed')
  })

  it('should span the visible width again when the diff is resized', async () => {
    const observed: (() => void)[] = []
    const native = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        observed.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    const { pane } = setup(repository())
    globalThis.ResizeObserver = native
    pane.open()
    await flush()
    const lines = pane.element.querySelector('.rv-lines') as HTMLElement
    const inner = pane.element.querySelector('.rv-inner') as HTMLElement

    Object.defineProperty(lines, 'clientWidth', { value: 1200, configurable: true })
    for (const callback of observed) callback()
    await frame()

    expect(inner.style.getPropertyValue('--rv-view')).toBe('1200px')
  })

  it('should hide the index with its button and keep that for the next review', async () => {
    const { pane, memory } = setup(repository())
    pane.open()
    await flush()
    const toggle = pane.element.querySelector('.rv-icon[aria-controls]') as HTMLButtonElement

    toggle.click()

    expect(pane.element.querySelector('.rv-files')?.hasAttribute('hidden')).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.dataset.tip).toBe('Show the file list')
    expect(memory.indexHidden).toBe(true)
  })

  it('should offer the other layout in the header while the review shares the tab', () => {
    const { pane, layouts } = setup(repository())
    const button = () => pane.element.querySelector('.rv-icon[data-tip-key="Ctrl+Shift+E"]')

    pane.setArrangement('side', false)
    const beside = [button()?.hasAttribute('hidden'), button()?.getAttribute('aria-label')]
    pane.setArrangement('stacked', false)
    const below = button()?.getAttribute('aria-label')
    ;(button() as HTMLButtonElement).click()
    pane.setArrangement(undefined, true)

    expect(beside).toEqual([false, 'Review below the terminal'])
    expect(below).toBe('Review beside the terminal')
    expect(layouts()).toBe(1)
    expect(button()?.hasAttribute('hidden')).toBe(true)
    expect(pane.element.querySelector('[data-tip-key="Esc"]')?.hasAttribute('hidden')).toBe(false)
  })

  it('should show the review keys only while it has the focus and the way back when it does not', async () => {
    const { pane, text } = setup(repository())
    const outside = document.createElement('textarea')
    document.body.append(outside)
    pane.open()
    await flush()

    ;(pane.element.querySelector('.rv-lines') as HTMLElement).focus()
    const inside = text('.phint')
    outside.focus()

    expect(inside).toBe('↑↓ navigate[ ] filen p hunkEsc terminalCtrl+R Refresh')
    expect(text('.phint')).toBe('Ctrl+Shift+D review')
  })

  it('should keep the reading when the review is closed and opened again', async () => {
    const { pane, key } = setup(repository())
    pane.open()
    await flush()
    const lines = pane.element.querySelector('.rv-lines') as HTMLElement
    lines.focus()
    key(lines, ']')
    const before = lines.getAttribute('aria-activedescendant')

    pane.close()
    pane.open()
    await flush()

    expect(before).toBe('review-tab-1-row-1')
    expect(lines.getAttribute('aria-activedescendant')).toBe(before)
  })

  it('should give the keys back to the terminal on Esc and read again on Ctrl+R', async () => {
    const { pane, key, escapes, requests } = setup(repository())
    pane.open()
    await flush()

    key(pane.element, 'Escape')
    key(pane.element, 'r', { ctrlKey: true })
    await flush()

    expect(escapes()).toBe(1)
    expect(requests).toHaveLength(2)
  })

  it('should name the base of the branch scope, say how it was found and offer the other bases', async () => {
    const { pane } = setup(repository())
    pane.open()
    await flush()

    const options = [...pane.element.querySelectorAll('.rv-head .select-option')].map((option) => [
      option.textContent,
      option.getAttribute('data-tip'),
    ])
    ;(pane.element.querySelector('.rv-head .select') as HTMLButtonElement).click()
    const listed = [...pane.element.querySelectorAll('.rv-head .select-option')].map((option) => [
      option.textContent,
      option.getAttribute('data-tip'),
    ])

    expect(options).toEqual([])
    expect(listed).toEqual([
      ['Uncommitted', null],
      ['Base: origin/develop', 'Created from origin/develop'],
      ['Base: main', null],
    ])
  })

  it('should keep another base for the repository and read the branch since it when it is picked', async () => {
    const { pane, requests, bases } = setup(repository())
    pane.open()
    await flush()
    const select = pane.element.querySelector('.rv-head .select') as HTMLButtonElement

    select.click()
    ;(pane.element.querySelectorAll('.rv-head .select-option')[2] as HTMLElement).click()
    await flush()
    await flush()

    expect(bases.get('/home/ana/acme')).toBe('main')
    expect(requests.at(-1)).toMatchObject({ scope: 'branch', base: 'main' })
  })

  it('should offer what is not pushed on a base branch and disable it without an upstream', async () => {
    const onBase = { ...feature, base: undefined, found: undefined, onBase: true }
    const pushed = setup(repository(undefined, { ...onBase, upstream: 'origin/main' }))
    pushed.pane.open()
    await flush()
    document.body.replaceChildren()
    const local = setup(repository(undefined, onBase))
    local.pane.open()
    await flush()

    const option = (pane: typeof pushed.pane) => {
      ;(pane.element.querySelector('.rv-head .select') as HTMLButtonElement).click()
      const found = pane.element.querySelectorAll('.rv-head .select-option')[1] as HTMLElement
      return [found.textContent, found.dataset.tip, found.getAttribute('aria-disabled')]
    }

    expect(option(pushed.pane)).toEqual(['Unpushed commits', 'Compared with origin/main', null])
    expect(option(local.pane)).toEqual([
      'Unpushed commits',
      'Branch has no upstream. Use git push -u to set one.',
      'true',
    ])
  })

  it('should ask for whitespace to be ignored when the toggle is pressed', async () => {
    const { pane, requests } = setup(repository())
    pane.open()
    await flush()

    const toggle = pane.element.querySelector<HTMLButtonElement>('.rv-icon[aria-pressed]')
    toggle?.click()
    await flush()

    expect(toggle?.getAttribute('aria-pressed')).toBe('true')
    expect(requests.at(-1)?.ignoreWhitespace).toBe(true)
  })

  it.each([
    [
      'outside a repository',
      ok({ kind: 'not-repository' as const }),
      'Not a Git repository',
      'Tab folder: ~/acme',
    ],
    ['with no change', repository(''), 'No uncommitted changes', 'No changes in ~/acme.'],
    [
      'without a base branch',
      ok({ kind: 'no-base' as const, root: '/home/ana/acme' }),
      'No base branch to compare with',
      'No base found among develop, main, master and release. Choose one in the selector.',
    ],
    [
      'on a base branch without an upstream',
      ok({ kind: 'no-upstream' as const, root: '/home/ana/acme' }),
      'No upstream',
      'Use git push -u to compare with the remote.',
    ],
    [
      'when git fails',
      fail(errorBody('DCK-GIT-002', 'diff')),
      'Git took too long to answer',
      'Run git status in the terminal to see why.',
    ],
  ])('should say so %s', async (_label, answer, title, detail) => {
    const { pane, text } = setup(answer)

    pane.open()
    await flush()

    expect(text('.rv-state strong')).toBe(title)
    expect(text('.rv-state span')).toBe(detail)
    expect(pane.element.querySelector('.rv-body')?.hasAttribute('hidden')).toBe(true)
  })

  it('should read again and draw the files when Try again is pressed after a failure', async () => {
    let failing = true
    const { pane, labels } = setup(() =>
      failing ? fail(errorBody('DCK-GIT-001', 'diff')) : repository(),
    )
    pane.open()
    await flush()

    failing = false
    pane.element.querySelector<HTMLButtonElement>('.rv-state .vbtn')?.click()
    await flush()

    expect(labels('.rv-file')).toHaveLength(2)
  })

  it('should keep only a few rows in the page when the diff has 10 000 lines', async () => {
    const lines = Array.from({ length: 5000 }, (_, index) => `-old ${index}`).concat(
      Array.from({ length: 5000 }, (_, index) => `+new ${index}`),
    )
    const big = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,5000 +1,5000 @@',
      ...lines,
      '',
    ].join('\n')
    const { pane } = setup(repository(big))
    pane.open()
    await flush()

    pane.element.querySelector<HTMLButtonElement>('.rv-show')?.click()

    expect(pane.element.querySelectorAll('.rv-row').length).toBeLessThan(100)
    expect((pane.element.querySelector('.rv-inner') as HTMLElement).style.height).toBe(
      `${40 + 26 + 10_000 * 20}px`,
    )
  })
})

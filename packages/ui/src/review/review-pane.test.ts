// @vitest-environment happy-dom
import {
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

const repository = (text = diffText(3000, 5000) + lockText) =>
  ok({
    kind: 'ok' as const,
    diff: reviewDiff(
      '/home/ana/acme',
      'uncommitted',
      'main',
      parseUnifiedDiff(text)
        .map((file) =>
          file.path === 'src/billing/invoice.ts' ? { ...file, newLineCount: 20 } : file,
        )
        .sort((a, b) => a.path.localeCompare(b.path)),
    ),
  })

type Answer = Result<DiffOutcome, ErrorBody>

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(answer: Answer | (() => Answer), cwd: string | undefined = '/home/ana/acme') {
  const requests: DiffRequest[] = []
  const reads: string[] = []
  let escapes = 0
  let closes = 0
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
    modifier: 'Ctrl',
    isModified: (event) => event.ctrlKey,
    cwd: async () => cwd,
    onEscape: () => {
      escapes += 1
    },
    onClose: () => {
      closes += 1
    },
  })
  document.body.append(pane.element)
  return {
    pane,
    requests,
    reads,
    escapes: () => escapes,
    closes: () => closes,
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

  it('should open on a file to read and keep a generated file collapsed until asked', async () => {
    const { pane, text, key } = setup(repository())
    pane.open()
    await flush()
    const first = pane.element
      .querySelector('.rv-file[aria-selected="true"]')
      ?.getAttribute('aria-label')
    key(pane.element.querySelector('.rv-files') as Element, 'ArrowUp')

    expect(first).toBe('src/billing/invoice.ts, modified, 1 added, 1 removed')

    expect(text('.rv-notice')).toContain('Generated files start collapsed.')
    pane.element.querySelector<HTMLButtonElement>('.rv-notice .vbtn')?.click()

    expect(pane.element.querySelector('.rv-notice')).toBeNull()
    expect(pane.element.querySelectorAll('.rv-row[data-kind]').length).toBe(2)
  })

  it('should number both sides, sign the changes and mark the changed word when a file is shown', async () => {
    const { pane, key, labels } = setup(repository())
    pane.open()
    await flush()

    key(pane.element.querySelector('.rv-files') as Element, 'ArrowDown')

    const rows = [...pane.element.querySelectorAll('.rv-row[data-kind]')].map((row) => [
      row.getAttribute('data-kind'),
      [...row.querySelectorAll('.rv-num')].map((cell) => cell.textContent),
      row.querySelector('.rv-sign')?.textContent,
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
  })

  it('should show the unchanged lines from the working tree when a collapsed gap is expanded', async () => {
    const { pane, key, reads, labels } = setup(repository())
    pane.open()
    await flush()
    key(pane.element.querySelector('.rv-files') as Element, 'ArrowDown')

    expect(labels('.rv-expand')).toEqual(['Show 9 lines', 'Show 8 lines'])
    pane.element.querySelector<HTMLElement>('.rv-expand')?.click()
    await flush()

    expect(reads).toEqual(['/home/ana/acme|src/billing/invoice.ts'])
    expect(labels('.rv-expand')).toEqual(['Show 8 lines'])
    expect(labels('.rv-row[data-kind="context"]')[0]).toBe('Line 1: text 1')
  })

  it('should move between hunks and files with the keys when the diff has the focus', async () => {
    const { pane, key } = setup(repository())
    pane.open()
    await flush()
    const lines = pane.element.querySelector('.rv-lines') as HTMLElement
    key(pane.element.querySelector('.rv-files') as Element, 'ArrowDown')

    key(lines, 'n')
    const first = lines.getAttribute('aria-activedescendant')
    key(lines, '[')
    const selected = pane.element
      .querySelector('.rv-file[aria-selected="true"]')
      ?.getAttribute('aria-label')

    expect(first).toBe('review-tab-1-row-1')
    expect(selected).toBe('pnpm-lock.yaml, modified, 1 added, 0 removed')
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
      'The review follows the folder of this tab: ~/acme',
    ],
    [
      'with no change',
      repository(''),
      'No uncommitted changes',
      'What the agent or you change in ~/acme shows up here.',
    ],
    [
      'without a base branch',
      ok({ kind: 'no-base' as const, root: '/home/ana/acme' }),
      'No base branch to compare with',
      'Looked for origin/HEAD, main and master.',
    ],
    [
      'when git fails',
      fail(errorBody('DCK-GIT-002', 'diff')),
      'Git took too long to answer',
      'Run git status in the terminal to see why, then try again.',
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

    pane.element.querySelector<HTMLButtonElement>('.rv-notice .vbtn')?.click()

    expect(pane.element.querySelectorAll('.rv-row').length).toBeLessThan(100)
    expect((pane.element.querySelector('.rv-inner') as HTMLElement).style.height).toBe(
      `${26 + 10_000 * 20}px`,
    )
  })
})

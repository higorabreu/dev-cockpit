// @vitest-environment happy-dom
import {
  createTranslator,
  type HostApi,
  noBranchInfo,
  ok,
  parseUnifiedDiff,
  reviewDiff,
} from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createKeymap } from '../platform/keymap.ts'
import { createReviewPane } from './review-pane.ts'

// One hunk of src/billing/invoice.ts: a kept line, one removed, two added and a kept one
const invoice = (start = 10, limit = '10') =>
  [
    'diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts',
    '--- a/src/billing/invoice.ts',
    '+++ b/src/billing/invoice.ts',
    `@@ -${start},3 +${start},4 @@ export function total(invoice: Invoice) {`,
    ' const base = 1',
    '-const timeout = 3000',
    '+const timeout = 5000',
    `+const limit = ${limit}`,
    ' return base',
    '',
  ].join('\n')

const tax = [
  'diff --git a/src/billing/tax.ts b/src/billing/tax.ts',
  '--- a/src/billing/tax.ts',
  '+++ b/src/billing/tax.ts',
  '@@ -1,1 +1,1 @@',
  '-export const rate = 0.1',
  '+export const rate = 0.2',
  '',
].join('\n')

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(first = invoice()) {
  let text = first
  const sent: string[] = []
  const api = {
    review: {
      diff: async () =>
        ok({
          kind: 'ok' as const,
          diff: reviewDiff('/home/ana/acme', 'uncommitted', noBranchInfo, parseUnifiedDiff(text)),
        }),
      fileLines: async () => ok([]),
      fingerprint: async () => undefined,
    },
    paths: { openFile: () => undefined },
  } as unknown as HostApi
  const pane = createReviewPane({
    id: 'review-tab-1',
    api,
    i18n: createTranslator('en'),
    memory: { indexHidden: false },
    keymap: createKeymap('pc'),
    cwd: async () => '/home/ana/acme',
    baseFor: () => undefined,
    chooseBase: async () => undefined,
    onEscape: () => undefined,
    onClose: () => undefined,
    onToggleLayout: () => undefined,
    send: (typed) => {
      sent.push(typed)
      return true
    },
  })
  document.body.append(pane.element)
  const find = <T extends Element = HTMLElement>(selector: string) =>
    pane.element.querySelector(selector) as T
  const all = (selector: string) => [...pane.element.querySelectorAll<HTMLElement>(selector)]
  const lines = () => find('.rv-lines')
  // The diff's lines of the change, in order: kept, removed, added, added, kept
  const line = (index: number) => all('.rv-row[data-kind]')[index] as HTMLElement
  const key = (target: Element, name: string, init: KeyboardEventInit = {}) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...init }))
  const click = (target: Element, init: MouseEventInit = {}) =>
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }))
  const field = () => find<HTMLTextAreaElement>('.rv-field')
  async function open() {
    pane.open()
    await flush()
    lines().focus()
  }
  // Writes a comment for the lines picked so far and saves it with Ctrl+Enter
  function write(body: string) {
    key(lines(), 'c')
    field().value = body
    field().dispatchEvent(new Event('input'))
    key(field(), 'Enter', { ctrlKey: true })
  }
  async function change(next: string) {
    text = next
    key(lines(), 'r', { ctrlKey: true })
    await flush()
  }
  return { pane, sent, find, all, lines, line, key, click, field, open, write, change }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('review comments', () => {
  it('should select the lines between a click and a Shift+click and open the field for them with c', async () => {
    // Arrange
    const { open, line, click, all, key, lines, field } = setup()
    await open()

    // Act
    click(line(1))
    click(line(3), { shiftKey: true })
    const selected = all('.rv-row[data-selected]').length
    key(lines(), 'c')

    // Assert
    expect(selected).toBe(3)
    expect(field().getAttribute('aria-label')).toBe('Comment: Lines 11-12')
    expect(document.activeElement).toBe(field())
  })

  it('should extend the selection from the cursor when Shift+ArrowDown is pressed', async () => {
    const { open, key, lines, all, field } = setup()
    await open()

    key(lines(), 'n')
    key(lines(), 'ArrowDown')
    key(lines(), 'ArrowDown', { shiftKey: true })
    key(lines(), 'ArrowDown', { shiftKey: true })
    const labels = all('.rv-row[data-selected]').map((row) => row.getAttribute('aria-label'))
    key(lines(), 'c')

    expect(labels).toEqual([
      'Line 10: const base = 1, selected',
      'Removed, line 11: const timeout = 3000, selected',
      'Added, line 11: const timeout = 5000, selected',
    ])
    expect(field().getAttribute('aria-label')).toBe('Comment: Lines 10-11')
  })

  it('should stop the selection at the edge of the hunk when Shift+ArrowUp goes past it', async () => {
    const { open, key, lines, all } = setup()
    await open()

    key(lines(), 'n')
    key(lines(), 'ArrowDown')
    key(lines(), 'ArrowUp', { shiftKey: true })

    expect(all('.rv-row[data-selected]')).toHaveLength(1)
  })

  it('should open the field for the line under the gutter + when it is clicked', async () => {
    const { open, line, click, field, find } = setup()
    await open()

    const add = line(3).querySelector('.rv-add') as HTMLElement
    click(add)

    expect(add.dataset.tipKey).toBe('c')
    expect(field().getAttribute('aria-label')).toBe('Comment: Line 12')
    expect(find('.rv-editor-host').hidden).toBe(false)
  })

  it('should show a saved comment under its last line and count it in the header and the file', async () => {
    // Arrange
    const { open, line, click, write, all, find } = setup()
    await open()

    // Act
    click(line(2))
    click(line(3), { shiftKey: true })
    write('use the constant from config')

    // Assert
    const rows = all('.rv-lines .rv-row').map((row) => row.getAttribute('aria-label'))
    expect(rows.slice(-2)).toEqual([
      'Lines 11-12, comment: use the constant from config',
      'Line 13: return base',
    ])
    expect(find('.rv-card-body').textContent).toBe('use the constant from config')
    expect(find('.rv-send').hidden).toBe(false)
    expect(find('.rv-send').getAttribute('aria-label')).toBe('Send 1 comment to the agent')
    expect(find('.rv-send').dataset.tipKey).toBe('Ctrl+Shift+Enter')
    expect(find('.rv-fhead').textContent).toContain('1 comment')
    expect(all('.rv-row[data-selected]')).toHaveLength(0)
    expect(document.activeElement).toBe(find('.rv-lines'))
  })

  it('should keep an empty comment from being saved and cancel the field with Esc', async () => {
    const { open, key, lines, field, all, find } = setup()
    await open()
    key(lines(), 'n')
    key(lines(), 'ArrowDown')
    key(lines(), 'c')

    key(field(), 'Enter', { ctrlKey: true })
    const stillOpen = field() !== null
    const saveDisabled = find('.rv-primary').hasAttribute('disabled')
    key(field(), 'Escape')

    expect([stillOpen, saveDisabled]).toEqual([true, true])
    expect(field()).toBeNull()
    expect(all('.rv-comment')).toHaveLength(0)
    expect(document.activeElement).toBe(lines())
  })

  it('should edit a comment with its button and delete it with Delete from the diff', async () => {
    // Arrange
    const { open, line, click, write, find, all, key, lines, field } = setup()
    await open()
    click(line(2))
    write('first')

    // Act
    click(find('.rv-card-action'))
    const before = field().value
    field().value = 'second'
    key(field(), 'Enter', { ctrlKey: true })
    const edited = find('.rv-card-body').textContent
    click(find('.rv-comment'))
    key(lines(), 'Delete')

    // Assert
    expect(before).toBe('first')
    expect(edited).toBe('second')
    expect(all('.rv-comment')).toHaveLength(0)
    expect(find('.rv-send').hidden).toBe(true)
  })

  it('should send every pending comment as one text with the header button and clear them', async () => {
    // Arrange
    const { open, line, click, write, find, all, sent } = setup()
    await open()
    click(line(1))
    write('keep the retry')
    click(line(3))
    write('name the limit')

    // Act
    click(find('.rv-send'))

    // Assert
    expect(sent).toEqual([
      [
        'src/billing/invoice.ts:11 (removed): keep the retry',
        '  > -const timeout = 3000',
        'src/billing/invoice.ts:12: name the limit',
        '  > +const limit = 10',
      ].join('\n'),
    ])
    expect(all('.rv-comment')).toHaveLength(0)
    expect(find('.rv-send').hidden).toBe(true)
  })

  it('should save a comment still in its field when the review is sent', async () => {
    const { open, line, click, key, lines, field, pane, sent } = setup()
    await open()
    click(line(3))
    key(lines(), 'c')
    field().value = 'not saved yet'

    pane.send()

    expect(sent).toEqual(['src/billing/invoice.ts:12: not saved yet\n  > +const limit = 10'])
  })

  it('should move a comment with its lines on a refresh and mark it outdated when they are gone', async () => {
    // Arrange
    const { open, line, click, write, change, all, find } = setup()
    await open()
    click(line(3))
    write('name the limit')

    // Act
    await change(invoice(20))
    const moved = all('.rv-comment').map((row) => row.getAttribute('aria-label'))
    await change(invoice(20, '12'))

    // Assert
    expect(moved).toEqual(['Line 22, comment: name the limit'])
    const rows = all('.rv-lines .rv-row')
    expect(rows[1]?.getAttribute('aria-label')).toBe('Line 22, outdated comment: name the limit')
    expect(find('.rv-outdated').textContent).toBe('Outdated')
    expect(find('.rv-card-quote').textContent).toBe('+ const limit = 10')
  })

  it('should list the comments of a file that left the change at the end and still send them', async () => {
    // Arrange
    const { open, line, click, write, change, find, pane, sent } = setup()
    await open()
    click(line(3))
    write('name the limit')

    // Act
    await change(tax)
    const gone = find('.rv-gone').getAttribute('aria-label')
    const path = find('.rv-card-path').textContent
    pane.send()

    // Assert
    expect(gone).toBe('Outdated comments on files no longer changed')
    expect(path).toBe('src/billing/invoice.ts')
    expect(sent).toEqual([
      'src/billing/invoice.ts:12 (outdated): name the limit\n  > +const limit = 10',
    ])
  })
})

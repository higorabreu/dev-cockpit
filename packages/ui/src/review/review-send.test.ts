// @vitest-environment happy-dom
import {
  createTranslator,
  type HostApi,
  type Locale,
  noBranchInfo,
  ok,
  parseUnifiedDiff,
  reviewDiff,
  type SessionActivityInfo,
} from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createKeymap } from '../platform/keymap.ts'
import { createReviewPane } from './review-pane.ts'

const invoice = [
  'diff --git a/src/billing/invoice.ts b/src/billing/invoice.ts',
  '--- a/src/billing/invoice.ts',
  '+++ b/src/billing/invoice.ts',
  '@@ -10,2 +10,2 @@',
  ' const base = 1',
  '-const timeout = 3000',
  '+const timeout = 5000',
  '',
].join('\n')

const at = (activity: SessionActivityInfo['activity'], process: string): SessionActivityInfo => ({
  cwd: '/home/ana/acme',
  process,
  activity,
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const LINE = 'Address the review comments in .git/dck/review-20261117-143000.md'
const OPEN_AGENT = 'No agent in this tab'

interface Options {
  // What runs in the terminal, for the watcher and for the fresh read at sending
  readonly running?: SessionActivityInfo
  readonly locale?: Locale
}

function setup(options: Options = {}) {
  let running = options.running
  const sent: string[] = []
  const notes: string[] = []
  const api = {
    review: {
      diff: async () =>
        ok({
          kind: 'ok' as const,
          diff: reviewDiff(
            '/home/ana/acme',
            'uncommitted',
            noBranchInfo,
            parseUnifiedDiff(invoice),
          ),
        }),
      fileLines: async () => ok([]),
      fingerprint: async () => undefined,
      saveNotes: async (root: string, markdown: string) => {
        notes.push(markdown)
        return ok(`${root}/.git/dck/review-20261117-143000.md`)
      },
    },
    paths: { openFile: () => undefined },
  } as unknown as HostApi
  const pane = createReviewPane({
    id: 'review-tab-1',
    api,
    i18n: createTranslator(options.locale ?? 'en'),
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
    activity: async () => running,
  })
  document.body.append(pane.element)
  const button = () => pane.element.querySelector('.rv-send') as HTMLButtonElement
  const status = () => pane.element.querySelector('.rv-status')?.textContent
  // Opens the review as the watcher sees the tab, and leaves one comment on the added line
  async function open() {
    pane.open()
    pane.activity(running)
    await flush()
    const lines = pane.element.querySelector('.rv-lines') as HTMLElement
    lines.focus()
    const press = (target: Element, key: string, init: KeyboardEventInit = {}) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
    press(lines, 'n')
    press(lines, 'ArrowDown')
    press(lines, 'ArrowDown')
    press(lines, 'c')
    const field = pane.element.querySelector('.rv-field') as HTMLTextAreaElement
    field.value = 'use the constant from config'
    press(field, 'Enter', { ctrlKey: true })
    await flush()
  }
  return {
    pane,
    sent,
    notes,
    button,
    status,
    open,
    // The terminal moved on: a fresh read sees it, the watcher only on its next round
    run: (info: SessionActivityInfo | undefined) => {
      running = info
    },
    click: async () => {
      button().dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await flush()
    },
  }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('review send', () => {
  it('should type the line and clear the comments when an agent runs in the terminal', async () => {
    // Arrange
    const { open, click, sent, button } = setup({ running: at('agent', 'claude') })
    await open()
    const label = button().textContent
    const disabled = button().getAttribute('aria-disabled')

    // Act
    await click()

    // Assert
    expect(label).toBe('Send to agent1')
    expect(disabled).toBeNull()
    expect(sent).toEqual([LINE])
    expect(button().hidden).toBe(true)
  })

  it('should disable the button, ask for an agent and keep the comments when a shell waits at its prompt', async () => {
    // Arrange
    const { open, click, pane, sent, notes, button, status } = setup({
      running: at('idle', 'bash'),
    })
    await open()

    // Act
    await click()
    const afterClick = status()
    await pane.send()

    // Assert
    expect(button().textContent).toBe('Send to agent1')
    expect(button().getAttribute('aria-disabled')).toBe('true')
    expect(button().dataset.tip).toBe(OPEN_AGENT)
    expect(afterClick).toBe('')
    expect(status()).toBe(OPEN_AGENT)
    expect(notes).toEqual([])
    expect(sent).toEqual([])
    expect(button().hidden).toBe(false)
  })

  it('should disable the button with the running program in its tooltip and keep the comments while it runs', async () => {
    // Arrange
    const { open, click, pane, sent, notes, button, status } = setup({ running: at('busy', 'vim') })
    await open()

    // Act
    await click()
    await pane.send()

    // Assert
    const reason = `vim is running in this tab`
    expect(button().textContent).toBe('Send to agent1')
    expect(button().getAttribute('aria-disabled')).toBe('true')
    expect(button().dataset.tip).toBe(reason)
    expect(status()).toBe(reason)
    expect(notes).toEqual([])
    expect(sent).toEqual([])
  })

  it('should say a program runs without a name when its name cannot be read', async () => {
    // Arrange
    const { open, button } = setup({ running: at('busy', '') })

    // Act
    await open()

    // Assert
    expect(button().dataset.tip).toBe(`A program is running in this tab`)
  })

  it('should give the reason in Portuguese with the same label when the interface is in Portuguese', async () => {
    // Arrange
    const { open, button } = setup({ running: at('idle', 'bash'), locale: 'pt-BR' })

    // Act
    await open()

    // Assert
    expect(button().textContent).toBe('Enviar ao agente1')
    expect(button().dataset.tip).toBe('Nenhum agente nesta aba')
  })

  it('should decide by a fresh read of the terminal when the watcher has not seen the change yet', async () => {
    // Arrange
    const { open, pane, run, sent, status, button } = setup({ running: at('agent', 'claude') })
    await open()
    run(at('busy', 'less'))

    // Act
    await pane.send()

    // Assert
    expect(sent).toEqual([])
    expect(status()).toBe(`less is running in this tab`)
    expect(button().getAttribute('aria-disabled')).toBe('true')
  })

  it('should drop the told reason from the header when the watcher sees an agent come to the tab', async () => {
    // Arrange
    const { open, pane, status } = setup({ running: at('busy', 'vim') })
    await open()
    await pane.send()
    pane.activity(at('busy', 'vim'))
    const same = status()

    // Act
    pane.activity(at('agent', 'claude'))

    // Assert
    expect(same).toBe(`vim is running in this tab`)
    expect(status()).toBe('')
  })

  it('should send and drop the earlier reason when a fresh read finds an agent the watcher has not seen yet', async () => {
    // Arrange
    const { open, pane, run, sent, status } = setup({ running: at('idle', 'bash') })
    await open()
    await pane.send()
    const before = status()
    run(at('agent', 'codex'))

    // Act
    await pane.send()

    // Assert
    expect(before).toBe(OPEN_AGENT)
    expect(sent).toEqual([LINE])
    expect(status()).toBe('')
  })
})

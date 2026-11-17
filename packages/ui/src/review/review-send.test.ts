// @vitest-environment happy-dom
import {
  type AgentProfile,
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
import type { AgentChoice } from './review-send.ts'

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

const claude: AgentProfile = {
  id: 'claude-code',
  name: 'Claude Code',
  processes: ['claude'],
  launch: 'claude',
}
const acme: AgentProfile = {
  id: 'acme',
  name: 'Acme Agent',
  processes: ['acme'],
  launch: 'acme run',
}

const at = (activity: SessionActivityInfo['activity'], process: string): SessionActivityInfo => ({
  cwd: '/home/ana/acme',
  process,
  activity,
  ...(activity === 'agent' ? { agent: claude } : {}),
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const LINE = 'Address the review comments in .git/dck/review-20261117-143000.md'

interface Options {
  // What runs in the terminal, for the watcher and for the fresh read at sending
  readonly running?: SessionActivityInfo
  readonly installed?: readonly AgentProfile[]
  readonly locale?: Locale
}

function setup(options: Options = {}) {
  let running = options.running
  const sent: string[] = []
  const notes: string[] = []
  const menus: { choices: readonly AgentChoice[]; focusAt: number }[] = []
  let launchChecks = 0
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
    launchable: async () => {
      launchChecks += 1
      return options.installed ?? [claude]
    },
    profiles: () => [claude, acme],
    chooseAgent: (_anchor, choices, focusAt) => void menus.push({ choices, focusAt }),
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
    menus,
    button,
    status,
    open,
    launchChecks: () => launchChecks,
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

    // Act
    await click()

    // Assert
    expect(label).toBe('Send to agent1')
    expect(sent).toEqual([LINE])
    expect(button().hidden).toBe(true)
  })

  it('should start the one installed agent with the review when the terminal waits at a shell prompt', async () => {
    // Arrange
    const { open, click, sent, button, notes } = setup({ running: at('idle', 'bash') })
    await open()
    const label = button().textContent
    const name = button().getAttribute('aria-label')
    const tip = button().dataset.tip

    // Act
    await click()

    // Assert
    expect(label).toBe('Start Claude Code with the review1')
    expect(name).toBe('Start Claude Code with 1 comment')
    expect(tip).toBe(
      'Writes the comments to a file and types claude with a line pointing to it at the terminal prompt, without Enter',
    )
    expect(notes).toHaveLength(1)
    expect(sent).toEqual([`claude '${LINE}'`])
    expect(button().hidden).toBe(true)
  })

  it('should name the agent to start in Portuguese when the interface is in Portuguese', async () => {
    // Arrange
    const { open, click, sent, button } = setup({ running: at('idle', 'bash'), locale: 'pt-BR' })
    await open()
    const label = button().textContent

    // Act
    await click()

    // Assert
    expect(label).toBe('Iniciar Claude Code com a revisão1')
    expect(sent).toEqual([
      "claude 'Resolva os comentários da revisão em .git/dck/review-20261117-143000.md'",
    ])
  })

  it('should disable the button, say none was found and keep the comments when no agent is installed', async () => {
    // Arrange
    const { open, click, pane, sent, notes, button, status } = setup({
      running: at('idle', 'bash'),
      installed: [],
    })
    await open()

    // Act
    await click()
    const afterClick = status()
    await pane.send()

    // Assert
    const reason =
      'No agent is running in the terminal and none was found on its PATH to start (claude, acme). The comments stay pending'
    expect(button().getAttribute('aria-disabled')).toBe('true')
    expect(button().dataset.tip).toBe(reason)
    expect(afterClick).toBe('')
    expect(status()).toBe(reason)
    expect(notes).toEqual([])
    expect(sent).toEqual([])
    expect(button().hidden).toBe(false)
  })

  it('should let the user pick the agent and remember the choice when two agents can start', async () => {
    // Arrange
    const { open, click, menus, sent, button } = setup({
      running: at('idle', 'bash'),
      installed: [claude, acme],
    })
    await open()
    const label = button().textContent
    const popup = button().getAttribute('aria-haspopup')

    // Act
    await click()
    menus[0]?.choices[1]?.run()
    await flush()
    await open()
    await click()

    // Assert
    expect(label).toBe('Start an agent with the review1')
    expect(popup).toBe('menu')
    expect(menus[0]?.choices.map((choice) => choice.label)).toEqual(['Claude Code', 'Acme Agent'])
    expect(menus[0]?.focusAt).toBe(0)
    expect(sent).toEqual([`acme run '${LINE}'`])
    expect(menus[1]?.focusAt).toBe(1)
  })

  it('should disable the button with the running program in its tooltip and keep the comments while it runs', async () => {
    // Arrange
    const { open, click, pane, sent, notes, button, status } = setup({ running: at('busy', 'vim') })
    await open()

    // Act
    await click()
    await pane.send()

    // Assert
    const reason = 'vim is running in the terminal. The comments stay pending until it ends'
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
    expect(button().dataset.tip).toBe(
      'A program is running in the terminal. The comments stay pending until it ends',
    )
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
    expect(status()).toBe(
      'less is running in the terminal. The comments stay pending until it ends',
    )
    expect(button().getAttribute('aria-disabled')).toBe('true')
  })

  it('should ask which agents can start only when the terminal comes to a prompt', async () => {
    // Arrange
    const { open, pane, launchChecks } = setup({ running: at('idle', 'bash') })
    await open()
    const opened = launchChecks()

    // Act
    pane.activity(at('idle', 'bash'))
    pane.activity(at('busy', 'make'))
    pane.activity(at('idle', 'bash'))
    await flush()

    // Assert
    expect(opened).toBe(1)
    expect(launchChecks()).toBe(2)
  })
})

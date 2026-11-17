import {
  type AgentProfile,
  errorCodeOf,
  type HostApi,
  launchText,
  pathFrom,
  type ReviewSendMode,
  reviewMarkdown,
  reviewPrompt,
  reviewSendMode,
  type SessionActivityInfo,
  type Translator,
} from '@dck/core'
import { h } from '../panel/dom.ts'
import type { Keymap } from '../platform/keymap.ts'
import type { ReviewComments } from './review-comments.ts'

export interface AgentChoice {
  readonly label: string
  run(): void
}

export interface ReviewSendDeps {
  readonly api: HostApi
  readonly i18n: Translator
  readonly keymap: Keymap
  readonly comments: ReviewComments
  // The repository the last read found, where the comments' file goes
  root(): string | undefined
  // The tab's folder right now, to type the file's path from it
  cwd(): Promise<string | undefined>
  // What runs in the tab's terminal right now, read fresh for the decision to send
  activity(): Promise<SessionActivityInfo | undefined>
  // The agents whose launch command is on the tab's PATH
  launchable(): Promise<readonly AgentProfile[]>
  // Every known agent, to name the commands looked for when none is installed
  profiles(): readonly AgentProfile[]
  // Types text at the tab's terminal prompt, without Enter, and gives it the keys; false when it could not
  type(text: string): boolean
  // The small menu to pick an agent, under the button; `focusAt` is the choice that takes the focus
  choose(anchor: HTMLElement, choices: readonly AgentChoice[], focusAt: number): void
  // A sentence in the review header, such as why nothing was sent
  notice(text: string): void
}

// "Send to agent" in the review header: what it does follows what runs in the tab's terminal. To a running
// agent it types one line naming the comments' file; at a shell prompt it types the command that starts an
// installed agent with that line; while another program runs it waits. The comments go only once typed
export function createReviewSend(deps: ReviewSendDeps) {
  const { i18n, comments } = deps
  const t = i18n.t
  // The tab's activity from the watcher's last read, and the agents found when it came to a prompt
  let activity: SessionActivityInfo | undefined
  let launchers: readonly AgentProfile[] = []
  // The agent picked last in this tab, first in focus the next time the choice opens
  let lastAgent: string | undefined
  // A send waits for the file to be written; a second press meanwhile would write it twice
  let sending = false

  const count = h('span', { class: 'rv-send-count' })
  const text = h('span', {})
  const button = h(
    'button',
    {
      type: 'button',
      class: 'vbtn rv-send',
      'data-tip-key': deps.keymap.label('reviewSend'),
      hidden: true,
    },
    text,
    count,
  )

  const mode = (): ReviewSendMode => reviewSendMode(activity, launchers, deps.profiles())

  // Why nothing can be sent right now, or undefined when something can
  function blocked(current: ReviewSendMode): string | undefined {
    if (current.kind === 'busy')
      return current.process
        ? t('review.send.busy', { process: current.process })
        : t('review.send.busyUnknown')
    if (current.kind === 'no-agent')
      return t('review.send.noAgent', { commands: current.commands.join(', ') })
    return undefined
  }

  function draw() {
    const pending = comments.count()
    const current = mode()
    button.hidden = pending === 0
    count.textContent = String(pending)
    const reason = blocked(current)
    if (reason) button.setAttribute('aria-disabled', 'true')
    else button.removeAttribute('aria-disabled')
    const several = current.kind === 'start' && current.agents.length > 1
    if (several) button.setAttribute('aria-haspopup', 'menu')
    else button.removeAttribute('aria-haspopup')
    const [only] = current.kind === 'start' && !several ? current.agents : []
    if (only) {
      text.textContent = t('review.start', { agent: only.name })
      button.dataset.tip = t('review.start.tip', { command: only.launch ?? '' })
      button.setAttribute(
        'aria-label',
        i18n.plural('review.start.a11y', pending, { agent: only.name }),
      )
    } else if (several) {
      text.textContent = t('review.startAny')
      button.dataset.tip = t('review.startAny.tip')
      button.setAttribute('aria-label', i18n.plural('review.startAny.a11y', pending))
    } else {
      text.textContent = t('review.send')
      button.dataset.tip = reason ?? t('review.send.tip')
      button.setAttribute('aria-label', i18n.plural('review.send.a11y', pending))
    }
  }

  async function checkLaunchers() {
    launchers = await deps.launchable()
    draw()
  }

  // The file, then the text typed: the line for a running agent, or the agent's command around it
  async function deliver(agent: AgentProfile | undefined) {
    const root = deps.root()
    const pending = comments.pending()
    if (pending.length === 0 || root === undefined) return
    const saved = await deps.api.review.saveNotes(root, reviewMarkdown(pending, i18n))
    if (!saved.ok) return deps.notice(t(`error.${errorCodeOf(saved.error)}`))
    const folder = await deps.cwd()
    const prompt = reviewPrompt(
      t,
      folder === undefined ? saved.value : pathFrom(folder, saved.value),
    )
    const typed = agent?.launch ? launchText(agent.launch, prompt) : prompt
    if (!deps.type(typed)) return deps.notice(t('review.send.refused'))
    comments.clear(pending)
    if (agent) lastAgent = agent.id
  }

  function choose(agents: readonly AgentProfile[]) {
    const focusAt = Math.max(
      0,
      agents.findIndex((agent) => agent.id === lastAgent),
    )
    const choices = agents.map((agent) => ({
      label: agent.name,
      run: () => void guarded(() => deliver(agent)),
    }))
    deps.choose(button, choices, focusAt)
  }

  async function guarded(task: () => Promise<void>) {
    if (sending) return
    sending = true
    try {
      await task()
    } finally {
      sending = false
    }
  }

  // The button and Ctrl+Shift+Enter: decided by what runs in the terminal right now, not the last read
  async function send() {
    if (comments.count() === 0 && comments.editor() === undefined) return
    await guarded(async () => {
      activity = (await deps.activity()) ?? activity
      if (activity?.activity === 'idle') launchers = await deps.launchable()
      draw()
      const current = mode()
      const reason = blocked(current)
      if (reason) return deps.notice(reason)
      if (current.kind === 'start' && current.agents.length > 1) return choose(current.agents)
      await deliver(current.kind === 'start' ? current.agents[0] : undefined)
    })
  }

  button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') !== 'true') void send()
  })

  return {
    element: button,
    draw,
    send,
    // The watcher read the tab again: coming to a shell prompt asks which agents could start there
    sync(next: SessionActivityInfo | undefined) {
      const before = activity?.activity
      activity = next
      if (next?.activity === 'idle' && before !== 'idle') void checkLaunchers()
      else draw()
    },
    // The review opened: the agents may have been installed or removed meanwhile
    recheck() {
      if (activity?.activity === 'idle') void checkLaunchers()
    },
  }
}

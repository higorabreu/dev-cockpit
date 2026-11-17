import {
  errorCodeOf,
  type HostApi,
  pathFrom,
  reviewMarkdown,
  reviewPrompt,
  reviewSendBlock,
  type SessionActivityInfo,
  type Translator,
} from '@dck/core'
import { h } from '../panel/dom.ts'
import type { Keymap } from '../platform/keymap.ts'
import type { ReviewComments } from './review-comments.ts'

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
  // Types text at the tab's terminal prompt, without Enter, and gives it the keys; false when it could not
  type(text: string): boolean
  // A sentence in the review header, such as why nothing was sent
  notice(text: string): void
}

// "Send to agent" in the review header: one line naming the comments' file goes to an agent running in the
// tab. At a shell prompt or under another program the line would be read as a command or as that program's
// input, so the button waits with the reason in its tooltip and the comments stay
export function createReviewSend(deps: ReviewSendDeps) {
  const { i18n, comments } = deps
  const t = i18n.t
  // The tab's activity from the watcher's last read, and whether its program reports its state
  let activity: SessionActivityInfo | undefined
  let reporting = false
  // A send waits for the file to be written; a second press meanwhile would write it twice
  let sending = false
  // The reason the header shows for the last refused send, until the tab no longer gives it
  let told: string | undefined

  const count = h('span', { class: 'rv-send-count' })
  const text = h('span', { class: 'rv-send-text' })
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

  function draw() {
    const pending = comments.count()
    const reason = reviewSendBlock(t, activity, reporting)
    button.hidden = pending === 0
    count.textContent = String(pending)
    text.textContent = t('review.send')
    button.dataset.tip = reason ?? t('review.send.tip')
    button.setAttribute('aria-label', i18n.plural('review.send.a11y', pending))
    if (reason) button.setAttribute('aria-disabled', 'true')
    else button.removeAttribute('aria-disabled')
  }

  // The file, then the line naming it; the comments go only once it was typed
  async function deliver() {
    const root = deps.root()
    const pending = comments.pending()
    if (pending.length === 0 || root === undefined) return
    const saved = await deps.api.review.saveNotes(root, reviewMarkdown(pending, i18n))
    if (!saved.ok) return deps.notice(t(`error.${errorCodeOf(saved.error)}`))
    const folder = await deps.cwd()
    const path = folder === undefined ? saved.value : pathFrom(folder, saved.value)
    if (!deps.type(reviewPrompt(t, path))) return deps.notice(t('review.send.refused'))
    comments.clear(pending)
    forget()
  }

  // A reason told before (no agent in the tab, a program running) no longer holds
  function forget() {
    if (told === undefined) return
    told = undefined
    deps.notice('')
  }

  // The button and Ctrl+Shift+Enter: decided by what runs in the terminal right now, not the last read
  async function send() {
    if (sending || (comments.count() === 0 && comments.editor() === undefined)) return
    sending = true
    try {
      activity = (await deps.activity()) ?? activity
      draw()
      const reason = reviewSendBlock(t, activity, reporting)
      if (reason) {
        told = reason
        deps.notice(reason)
      } else await deliver()
    } finally {
      sending = false
    }
  }

  button.addEventListener('click', () => {
    if (button.getAttribute('aria-disabled') !== 'true') void send()
  })

  return {
    element: button,
    draw,
    send,
    // The watcher read the tab again: the button follows what runs in its terminal
    sync(next: SessionActivityInfo | undefined, reports = false) {
      activity = next
      reporting = reports
      if (told !== undefined && reviewSendBlock(t, activity, reporting) !== told) forget()
      draw()
    },
  }
}

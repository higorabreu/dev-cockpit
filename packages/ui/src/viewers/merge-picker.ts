import { type ConflictChoice, type MergeRegion, mergeRegions, resolveRegions } from '@dck/core'
import { h, icon } from '../panel/dom.ts'

export interface PickerTexts {
  readonly mine: string
  readonly disk: string
  readonly useMine: string
  readonly useDisk: string
  readonly useBoth: string
  readonly done: string
  readonly cancel: string
  readonly next: string
  readonly previous: string
  readonly label: string
  conflict(index: number, total: number): string
  chosen(choice: ConflictChoice): string
  left(count: number): string
  unchanged(count: number): string
}

export interface PickerOptions {
  readonly parent: HTMLElement
  readonly base: string
  readonly mine: string
  readonly disk: string
  readonly lineBreak: string
  readonly texts: PickerTexts
  // Done's key as this keyboard writes it (Ctrl+Enter, ⌘Enter)
  readonly doneKey: string
  // The merged text, every conflict settled: it goes into the editor as one step Ctrl+Z takes back
  done(text: string): void
  // Back to the conflict strip, nothing changed
  cancel(): void
}

// Lines kept around a conflict, as a diff's context; longer merged stretches fold into one line
const CONTEXT = 3

// The picker's keys: no text field takes them, so plain letters work, as in a review
const KEYS = {
  next: 'n',
  previous: 'p',
  mine: 'm',
  disk: 'd',
  both: 'b',
} as const

const ICONS = {
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
} as const

const lineText = (line: string) => line.replace(/\r?\n$/, '')

function lines(text: readonly string[], kind: string): HTMLElement {
  return h(
    'div',
    { class: `mp-lines ${kind}` },
    ...text.map((line) => h('div', { class: 'mp-line' }, lineText(line) || ' ')),
  )
}

// What a merged stretch shows: all of it when short, else its ends next to a conflict and a fold
function mergedLines(
  region: Extract<MergeRegion, { kind: 'merged' }>,
  before: boolean,
  after: boolean,
  texts: PickerTexts,
): HTMLElement[] {
  const kind = region.source === 'disk' ? 'from-disk' : 'merged'
  const all = region.lines
  const head = before ? all.slice(0, CONTEXT) : []
  const tail = after ? all.slice(Math.max(head.length, all.length - CONTEXT)) : []
  const hidden = all.length - head.length - tail.length
  if (hidden <= 1) return [lines(all, kind)]
  return [
    ...(head.length > 0 ? [lines(head, kind)] : []),
    h('div', { class: 'mp-fold' }, texts.unchanged(hidden)),
    ...(tail.length > 0 ? [lines(tail, kind)] : []),
  ]
}

// Compare on a conflict with the disk: the three versions merged as git merges them (core merge.ts),
// what merges by itself already in place, and each conflicting region with the user's lines and the
// disk's and "Use mine", "Use disk", "Use both". Done puts the result in the editor
export function createMergePicker(options: PickerOptions) {
  const { texts } = options
  const regions = mergeRegions(options.base, options.mine, options.disk)
  const conflicts = regions.flatMap((region) => (region.kind === 'conflict' ? [region] : []))
  const choices: (ConflictChoice | undefined)[] = conflicts.map(() => undefined)
  let current = 0

  const iconButton = (svg: string, label: string, key: string) =>
    h(
      'button',
      {
        type: 'button',
        class: 'fv-icon',
        'aria-label': label,
        'data-tip': label,
        'data-tip-key': key,
      },
      icon(svg, 15),
    )
  const previous = iconButton(ICONS.up, texts.previous, KEYS.previous.toUpperCase())
  const next = iconButton(ICONS.down, texts.next, KEYS.next.toUpperCase())
  const status = h('span', { class: 'mp-status', role: 'status' })
  const cancel = h(
    'button',
    { type: 'button', class: 'fv-action', 'data-tip': texts.cancel, 'data-tip-key': 'Esc' },
    texts.cancel,
  )
  const done = h(
    'button',
    {
      type: 'button',
      class: 'fv-action primary',
      'data-tip': texts.done,
      'data-tip-key': options.doneKey,
    },
    texts.done,
  )
  const bar = h(
    'div',
    { class: 'mp-bar' },
    previous,
    next,
    status,
    h('span', { class: 'fv-spacer' }),
    cancel,
    done,
  )

  const blocks: HTMLElement[] = []
  const pickers: HTMLButtonElement[][] = []
  const body = h('div', { class: 'mp-body scroll' })
  regions.forEach((region, index) => {
    if (region.kind === 'merged') {
      const before = regions[index - 1]?.kind === 'conflict'
      const after = regions[index + 1]?.kind === 'conflict'
      body.append(...mergedLines(region, before, after, texts))
      return
    }
    const at = blocks.length
    const pick = (choice: ConflictChoice, label: string, key: string) => {
      const button = h(
        'button',
        {
          type: 'button',
          class: 'fv-action',
          'aria-pressed': 'false',
          'data-tip': label,
          'data-tip-key': key.toUpperCase(),
        },
        label,
      )
      button.addEventListener('click', () => choose(at, choice))
      return button
    }
    const buttons = [
      pick('mine', texts.useMine, KEYS.mine),
      pick('disk', texts.useDisk, KEYS.disk),
      pick('both', texts.useBoth, KEYS.both),
    ]
    pickers.push(buttons)
    const block = h(
      'section',
      {
        class: 'mp-conflict',
        tabindex: '-1',
        'aria-label': texts.conflict(at + 1, conflicts.length),
      },
      h(
        'div',
        { class: 'mp-conflict-head' },
        h('span', { class: 'mp-conflict-name' }, texts.conflict(at + 1, conflicts.length)),
        h('span', { class: 'mp-choice' }),
        h('span', { class: 'fv-spacer' }),
        ...buttons,
      ),
      h(
        'div',
        { class: 'mp-side mine' },
        h('div', { class: 'mp-side-name' }, texts.mine),
        lines(region.mine, 'mine'),
      ),
      h(
        'div',
        { class: 'mp-side disk' },
        h('div', { class: 'mp-side-name' }, texts.disk),
        lines(region.disk, 'disk'),
      ),
    )
    block.addEventListener('focusin', () => {
      current = at
      show()
    })
    blocks.push(block)
    body.append(block)
  })

  const element = h('div', { class: 'merge-picker', 'aria-label': texts.label }, bar, body)
  options.parent.append(element)

  function show() {
    const left = choices.filter((choice) => choice === undefined).length
    status.textContent =
      conflicts.length === 0
        ? texts.left(0)
        : `${texts.conflict(current + 1, conflicts.length)} · ${texts.left(left)}`
    done.disabled = left > 0
    blocks.forEach((block, index) => {
      const choice = choices[index]
      block.toggleAttribute('data-current', index === current)
      if (choice) block.setAttribute('data-choice', choice)
      const label = block.querySelector('.mp-choice')
      if (label) label.textContent = choice ? texts.chosen(choice) : ''
      for (const [at, button] of (pickers[index] ?? []).entries())
        button.setAttribute(
          'aria-pressed',
          String(choice === (['mine', 'disk', 'both'] as const)[at]),
        )
    })
  }

  function go(index: number) {
    if (blocks.length === 0) return
    current = (index + blocks.length) % blocks.length
    const block = blocks[current]
    block?.focus({ preventScroll: true })
    block?.scrollIntoView({ block: 'nearest' })
    show()
  }

  // A choice moves on to the next conflict still open, as a review steps to the next file
  function choose(index: number, choice: ConflictChoice) {
    choices[index] = choice
    const open = choices.findIndex((value, at) => value === undefined && at > index)
    const first = choices.indexOf(undefined)
    show()
    if (open >= 0) go(open)
    else if (first >= 0) go(first)
    else done.focus()
  }

  function finish() {
    const text = resolveRegions(regions, choices, options.lineBreak)
    if (text !== undefined) options.done(text)
  }

  previous.addEventListener('click', () => go(current - 1))
  next.addEventListener('click', () => go(current + 1))
  cancel.addEventListener('click', options.cancel)
  done.addEventListener('click', finish)
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      options.cancel()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      finish()
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const key = event.key.toLowerCase()
    const action =
      key === KEYS.next || event.key === 'F7'
        ? () => go(current + (event.shiftKey ? -1 : 1))
        : key === KEYS.previous
          ? () => go(current - 1)
          : key === KEYS.mine
            ? () => choose(current, 'mine')
            : key === KEYS.disk
              ? () => choose(current, 'disk')
              : key === KEYS.both
                ? () => choose(current, 'both')
                : undefined
    if (!action) return
    event.preventDefault()
    action()
  })

  show()
  return {
    element,
    conflicts: conflicts.length,
    focus: () => go(current),
    destroy: () => element.remove(),
  }
}

export type MergePicker = ReturnType<typeof createMergePicker>

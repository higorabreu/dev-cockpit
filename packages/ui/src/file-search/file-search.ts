import {
  type FileGroups,
  type FileListing,
  folderToStep,
  type GitOthers,
  isClosedFolder,
  stepRows,
  type Translator,
  type WalkResult,
} from '@dck/core'
import { actionHint, closeButton } from '../kit/panel-frame.ts'
import { h } from '../panel/dom.ts'
import type { Keymap } from '../platform/keymap.ts'
import type { FileRanker } from './file-ranker.ts'
import { type Choice, drawGroups } from './file-rows.ts'

export interface FileSearchElements {
  readonly overlay: HTMLElement
  readonly input: HTMLInputElement
  readonly results: HTMLElement
  readonly hint: HTMLElement
}

export interface FileSearchDeps {
  list(cwd: string): Promise<FileListing>
  others(root: string): Promise<GitOthers>
  expand(root: string, folder: string): Promise<WalkResult>
  // A new ranker for each search: its worker goes when the search closes
  readonly ranker: FileRanker
  // The file's path inside the listing's root
  onPick(root: string, path: string): void
  onClose(): void
  readonly i18n: Translator
  readonly keymap: Keymap
}

type Stage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'no-folder' }
  | { readonly kind: 'listing' }
  | { readonly kind: 'ready'; readonly listing: FileListing }

// The file search: the same look and keys as the project search, the project's files first and the
// files git ignores apart, shown only when what is typed finds them
export function createFileSearch(elements: FileSearchElements, deps: FileSearchDeps) {
  const { overlay, input, results, hint } = elements
  const { i18n, keymap, ranker } = deps
  const t = i18n.t
  const wide = h('span', { class: 'fwide', hidden: true })
  const row = h('div', { class: 'prow' })
  input.replaceWith(row)
  row.append(
    input,
    wide,
    closeButton(t, () => close()),
  )

  let stage: Stage = { kind: 'idle' }
  let widened = false
  let choices: readonly Choice[] = []
  let selected = 0
  // Closed ignored folders known so far: the listing's and those found stepping into one
  let closed: string[] = []
  const steps = new Map<string, WalkResult | 'listing'>()
  // A redraw for an older key is dropped, and a listing for a search closed since
  let drawn = 0
  let opened = 0

  const isOpen = () => overlay.classList.contains('open')

  function drawHint() {
    const offered = stage.kind === 'ready' && stage.listing.kind === 'git'
    wide.hidden = !widened
    wide.textContent = t('fileSearch.widened')
    hint.hidden = !offered
    if (!offered) return hint.replaceChildren()
    const action = actionHint(
      keymap.label('fileSearch'),
      t(widened ? 'fileSearch.narrow' : 'fileSearch.widen'),
    )
    action.addEventListener('click', () => {
      toggleWiden()
      input.focus()
    })
    hint.replaceChildren(action)
  }

  function message(text: string) {
    choices = []
    results.replaceChildren(h('div', { class: 'empty' }, text))
  }

  function show(groups: FileGroups, folder?: string) {
    const listing = stage.kind === 'ready' ? stage.listing : undefined
    choices = drawGroups(results, groups, {
      t,
      plural: i18n.plural,
      selected,
      folder,
      truncated:
        listing?.truncated === true && folder === undefined ? listing.files.length : undefined,
      widenKey: 'fileSearch',
    })
    if (choices.length === 0) message(t('fileSearch.none'))
    selected = Math.min(selected, Math.max(0, choices.length - 1))
  }

  function stepInto(folder: string, root: string, query: string) {
    const found = steps.get(folder)
    if (found === 'listing') return message(t('fileSearch.listingFolder', { folder }))
    if (found) {
      const rows = stepRows(folder, found.entries, query)
      return show({ project: [], ignored: rows, more: 0, loose: true }, folder)
    }
    steps.set(folder, 'listing')
    message(t('fileSearch.listingFolder', { folder }))
    void deps.expand(root, folder).then((result) => {
      steps.set(folder, result)
      closed = [...closed, ...result.entries.filter(isClosedFolder)]
      if (isOpen()) filter(false)
    })
  }

  function filter(reset = true) {
    if (stage.kind !== 'ready') return
    if (reset) selected = 0
    const query = input.value
    const folder = folderToStep(query, closed)
    if (folder !== undefined) return stepInto(folder, stage.listing.root, query)
    const ticket = ++drawn
    void ranker.groups(query, widened).then((groups) => {
      if (groups && ticket === drawn && isOpen()) show(groups)
    })
  }

  function toggleWiden() {
    if (stage.kind !== 'ready' || stage.listing.kind !== 'git') return
    widened = !widened
    drawHint()
    filter()
  }

  function close() {
    overlay.classList.remove('open')
    opened += 1
    ranker.release()
    stage = { kind: 'idle' }
    widened = false
    choices = []
    closed = []
    steps.clear()
    input.value = ''
    results.replaceChildren()
    deps.onClose()
  }

  function pick() {
    const choice = choices[selected]
    if (!choice || stage.kind !== 'ready') return
    if (choice.kind === 'more') return toggleWiden()
    if (choice.row.folder) {
      input.value = choice.row.path
      return filter()
    }
    const root = stage.listing.root
    close()
    deps.onPick(root, choice.row.path)
  }

  function move(step: number) {
    if (choices.length === 0) return
    selected = (selected + step + choices.length) % choices.length
    for (const option of results.querySelectorAll('[data-index]')) {
      const on = Number((option as HTMLElement).dataset.index) === selected
      option.classList.toggle('on', on)
      option.setAttribute('aria-selected', String(on))
      if (on) option.scrollIntoView({ block: 'nearest' })
    }
  }

  input.addEventListener('input', () => filter())
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close()
    else if (event.key === 'Enter') pick()
    else if (event.key === 'ArrowDown') move(1)
    else if (event.key === 'ArrowUp') move(-1)
    else return
    event.preventDefault()
    event.stopPropagation()
  })
  results.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    const option = event.target.closest<HTMLElement>('[data-index]')
    if (!option) return
    selected = Number(option.dataset.index)
    pick()
    if (isOpen()) input.focus()
  })
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close()
  })

  return {
    isOpen,
    // Opens at once and lists the tab's folder when it is known (undefined when the tab has none);
    // `recent` gives paths inside the listing's root
    async open(folder: Promise<string | undefined>, recent: (root: string) => readonly string[]) {
      const ticket = ++opened
      widened = false
      input.value = ''
      overlay.classList.add('open')
      input.focus()
      stage = { kind: 'listing' }
      drawHint()
      message(t('fileSearch.listing'))
      const cwd = await folder
      if (ticket !== opened || !isOpen()) return
      if (cwd === undefined) {
        stage = { kind: 'no-folder' }
        drawHint()
        return message(t('fileSearch.noFolder'))
      }
      const listing = await deps.list(cwd)
      if (ticket !== opened || !isOpen()) return
      stage = { kind: 'ready', listing }
      closed = listing.ignored.filter(isClosedFolder)
      ranker.load({ files: listing.files, ignored: listing.ignored, recent: recent(listing.root) })
      drawHint()
      filter()
      if (!listing.partial) return
      // The tracked files show at once; the untracked and ignored ones join when git has walked the tree
      const others = await deps.others(listing.root)
      if (ticket !== opened || !isOpen()) return
      const full: FileListing = {
        ...listing,
        files: [...listing.files, ...others.files],
        ignored: others.ignored,
        truncated: listing.truncated || others.truncated,
        partial: false,
      }
      stage = { kind: 'ready', listing: full }
      closed = [...closed, ...others.ignored.filter(isClosedFolder)]
      ranker.load({ files: full.files, ignored: full.ignored, recent: recent(full.root) })
      filter(false)
    },
    // The search key again: the ignored files join the search, or leave it
    toggleWiden,
    close: () => {
      if (isOpen()) close()
    },
    retranslate() {
      drawHint()
      if (isOpen()) filter(false)
    },
  }
}

export type FileSearchView = ReturnType<typeof createFileSearch>

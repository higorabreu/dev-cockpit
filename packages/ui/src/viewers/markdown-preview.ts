import { linkTarget } from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import { PENDING_SRC, renderMarkdown } from './markdown-render.ts'

export interface PreviewTexts {
  readonly label: string
  readonly remote: string
  readonly loadRemote: string
}

export interface PreviewDeps {
  readonly path: string
  readonly texts: PreviewTexts
  // Addresses for the images under the file's folder, in order (null: refused)
  assets(paths: readonly string[]): Promise<readonly (string | null)[]>
  // A code block in the editor's colors; undefined leaves it plain
  highlight(code: string, language: string): Promise<DocumentFragment | undefined>
  openLink(url: string): void
  openFile(path: string, line?: number): void
  // The text to draw again once the user lets remote images in
  text(): string
}

const IMAGE =
  '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'

// The Markdown preview: the editor's text drawn with the cockpit's fonts and tokens (styles/markdown.css).
// Web links open in the system's browser, a relative link opens its file in the cockpit, an anchor scrolls
// to its heading. Images under the file's folder come through the protocol; remote ones wait behind a
// placeholder until the user lets them in, for this file while it stays open
export function createMarkdownPreview(parent: HTMLElement, deps: PreviewDeps) {
  const { texts } = deps
  const element = h('article', {
    class: 'md-preview scroll',
    tabindex: '0',
    'aria-label': texts.label,
  })
  parent.append(element)
  let remoteAllowed = false
  // A render that finished after a newer one began is dropped
  let generation = 0

  function placeholder(url: string) {
    const load = h('button', { type: 'button', class: 'md-remote-load' }, texts.loadRemote)
    load.addEventListener('click', () => {
      remoteAllowed = true
      void render(deps.text())
    })
    return h(
      'span',
      { class: 'md-remote' },
      icon(IMAGE, 14),
      h('span', { class: 'md-remote-text' }, texts.remote),
      h('span', { class: 'md-remote-url', 'data-tip-full': url }, url),
      load,
    )
  }

  async function render(text: string) {
    const at = ++generation
    const rendered = await renderMarkdown(text, deps.path)
    if (at !== generation) return
    const urls =
      rendered.locals.length > 0
        ? await deps.assets(rendered.locals.map((local) => local.path))
        : []
    if (at !== generation) return
    rendered.locals.forEach(({ element: image }, index) => {
      const url = urls[index]
      image.removeAttribute(PENDING_SRC)
      if (url) image.src = url
      else image.remove()
    })
    for (const { element: image, url } of rendered.remotes) {
      image.removeAttribute(PENDING_SRC)
      if (remoteAllowed) image.src = url
      else image.replaceWith(placeholder(url))
    }
    // A code block scrolls sideways with the design system's scrollbar
    for (const block of rendered.fragment.querySelectorAll('pre')) block.classList.add('scroll')
    const top = element.scrollTop
    element.replaceChildren(rendered.fragment)
    element.scrollTop = top
    for (const { element: code, language } of rendered.codes)
      void deps.highlight(code.textContent ?? '', language).then((colored) => {
        if (colored && at === generation) code.replaceChildren(colored)
      })
  }

  const headings = () => [
    ...element.querySelectorAll<HTMLElement>(
      ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6',
    ),
  ]

  element.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest('a')
    if (!link || !element.contains(link)) return
    event.preventDefault()
    const target = linkTarget(link.getAttribute('href') ?? '', deps.path)
    if (target.kind === 'external') deps.openLink(target.url)
    else if (target.kind === 'file') deps.openFile(target.path, target.line)
    else if (target.kind === 'anchor')
      element
        .querySelector(`[data-md-anchor="${CSS.escape(target.slug)}"]`)
        ?.scrollIntoView({ block: 'start' })
  })

  return {
    element,
    render,
    focus: () => element.focus({ preventScroll: true }),
    // The top level heading nearest the top of the view, by its order; -1 above the first
    topHeading(): number {
      const top = element.getBoundingClientRect().top + 1
      let found = -1
      for (const [index, heading] of headings().entries()) {
        if (heading.getBoundingClientRect().top > top) break
        found = index
      }
      return found
    },
    showHeading(index: number) {
      if (index < 0) element.scrollTop = 0
      else headings()[index]?.scrollIntoView({ block: 'start' })
    },
    destroy() {
      generation++
      element.remove()
    },
  }
}

export type MarkdownPreview = ReturnType<typeof createMarkdownPreview>

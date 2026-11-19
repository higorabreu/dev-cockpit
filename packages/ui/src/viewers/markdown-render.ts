import { headingSlug, imageSource, linkTarget } from '@dck/core'
import type { Config, DOMPurify } from 'dompurify'

// What the preview still has to do with the sanitized HTML: images to draw (a local one through the
// protocol, a remote one only when the user asks) and code blocks to color
export interface RenderedMarkdown {
  readonly fragment: DocumentFragment
  readonly locals: readonly { readonly element: HTMLImageElement; readonly path: string }[]
  readonly remotes: readonly { readonly element: HTMLImageElement; readonly url: string }[]
  readonly codes: readonly { readonly element: HTMLElement; readonly language: string }[]
}

// The address of an image waits here until the preview decides it may load
export const PENDING_SRC = 'data-md-src'

// Tags a README has no use for, and those that would load or run something: frames, plugins, media,
// forms, styles, and inline SVG and MathML (the html profile leaves those out already)
const FORBID_TAGS = [
  'style',
  'link',
  'meta',
  'base',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'video',
  'audio',
  'source',
  'track',
  'picture',
  'form',
  'button',
  'textarea',
  'select',
  'option',
]

const CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS,
  FORBID_ATTR: ['style', 'srcset', 'target', 'formaction', 'ping'],
  ALLOW_DATA_ATTR: false,
}

interface Engine {
  parse(text: string): string
  readonly purify: DOMPurify
}

let engine: Promise<Engine> | undefined

// marked and DOMPurify load with the first preview, never with the cockpit
function loadEngine(): Promise<Engine> {
  engine ??= Promise.all([import('marked'), import('dompurify')]).then(([marked, dompurify]) => {
    const purify = dompurify.default(window)
    // An image never loads while the HTML is being cleaned or moved into the page: its address waits
    // in a data attribute until the preview has checked it
    purify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src')
        node.removeAttribute('src')
        if (src !== null) node.setAttribute(PENDING_SRC, src)
      }
    })
    const parser = new marked.Marked({ gfm: true, async: false })
    return { purify, parse: (text: string) => parser.parse(text, { async: false }) }
  })
  return engine
}

// A task list's box as a drawn mark, its state in shape (a tick) and for a screen reader
function taskMark(input: Element): HTMLElement {
  const checked = input.hasAttribute('checked')
  const mark = document.createElement('span')
  mark.className = checked ? 'md-task checked' : 'md-task'
  mark.setAttribute('role', 'checkbox')
  mark.setAttribute('aria-checked', String(checked))
  mark.setAttribute('aria-disabled', 'true')
  return mark
}

// The file's Markdown as clean HTML: GitHub's flavor (tables, task lists, strikethrough), no script, no
// handler, no frame, no style; links and images classified by the core's rules (markdown-links.ts)
export async function renderMarkdown(
  text: string,
  documentPath: string,
): Promise<RenderedMarkdown> {
  const { parse, purify } = await loadEngine()
  return classify(
    purify.sanitize(parse(text), { ...CONFIG, RETURN_DOM_FRAGMENT: true }),
    documentPath,
  )
}

// What the sanitized HTML needs before it shows: anchors for the headings, where each link leads, task
// boxes drawn, and each image sorted by its source, none of them loading yet (their address is in
// PENDING_SRC)
export function classify(fragment: DocumentFragment, documentPath: string): RenderedMarkdown {
  const taken = new Map<string, number>()
  for (const heading of fragment.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    heading.setAttribute('data-md-anchor', headingSlug(heading.textContent ?? '', taken))
  for (const link of fragment.querySelectorAll('a')) {
    const target = linkTarget(link.getAttribute('href') ?? '', documentPath)
    link.setAttribute('data-md-link', target.kind)
    if (target.kind === 'none') link.removeAttribute('href')
  }
  for (const input of fragment.querySelectorAll('input'))
    if (input.getAttribute('type') === 'checkbox') input.replaceWith(taskMark(input))
    else input.remove()
  const locals: { element: HTMLImageElement; path: string }[] = []
  const remotes: { element: HTMLImageElement; url: string }[] = []
  for (const image of fragment.querySelectorAll('img')) {
    const source = imageSource(image.getAttribute(PENDING_SRC) ?? '', documentPath)
    image.loading = 'lazy'
    image.decoding = 'async'
    if (source.kind === 'local') locals.push({ element: image, path: source.path })
    else if (source.kind === 'remote') remotes.push({ element: image, url: source.url })
    else if (source.kind === 'inline') image.src = image.getAttribute(PENDING_SRC) ?? ''
    else image.remove()
  }
  const codes = [...fragment.querySelectorAll<HTMLElement>('pre > code')].flatMap((element) => {
    const language = /\blanguage-([\w+#.-]+)/.exec(element.className)?.[1]
    return language ? [{ element, language }] : []
  })
  return { fragment, locals, remotes, codes }
}

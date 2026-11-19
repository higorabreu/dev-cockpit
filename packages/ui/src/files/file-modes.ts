import { headingLines, type Translate } from '@dck/core'
import type { CodeEditor } from '../editor/code-editor.ts'
import { h } from '../panel/dom.ts'
import { type ImageTexts, type ImageView, showImage, type ZoomStep } from '../viewers/image-view.ts'
import { createMarkdownPreview, type MarkdownPreview } from '../viewers/markdown-preview.ts'

// Source: the editor alone. Rendered: the preview or the image alone. Split: both, side by side (Markdown,
// in a wide enough view)
export type FileMode = 'source' | 'rendered' | 'split'

export interface ModesDeps {
  readonly kind: 'markdown' | 'svg'
  readonly path: string
  readonly t: Translate
  // The view's body, which holds the editor's host and the rendered side
  readonly body: HTMLElement
  readonly editorHost: HTMLElement
  readonly editor: CodeEditor
  // An SVG's address through the protocol
  readonly url?: string
  readonly imageTexts: ImageTexts
  assets(paths: readonly string[]): Promise<readonly (string | null)[]>
  highlight(code: string, language: string): Promise<DocumentFragment | undefined>
  openLink(url: string): void
  openFile(path: string, line?: number): void
  // The edits written before an SVG's image is drawn again from the disk
  flush(): Promise<void>
  // The mode changed: the header shows the editor's tools or not
  onChange(): void
}

// The preview follows typing beside the editor after this pause
const PREVIEW_MS = 300

// A Markdown file between its text, its preview and both side by side, or an SVG between its image and
// its code, as the header's buttons and the preview key switch them. The editor stays alive under both
export function createFileModes(deps: ModesDeps) {
  const { t, body, editor } = deps
  const markdown = deps.kind === 'markdown'
  const rendered = h('div', { class: markdown ? 'fv-rendered md-host' : 'fv-rendered image-host' })
  body.append(rendered)
  let mode: FileMode = markdown ? 'source' : 'rendered'
  let preview: MarkdownPreview | undefined
  let image: ImageView | undefined
  let drawn = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const button = (label: string, shortcut: boolean, extra = '') =>
    h(
      'button',
      {
        type: 'button',
        class: `fv-mode${extra}`,
        'aria-pressed': 'false',
        'data-tip': label,
        ...(shortcut ? { 'data-tip-shortcut': 'filePreview' } : {}),
      },
      label,
    )
  const buttons: [FileMode, HTMLButtonElement][] = markdown
    ? [
        ['source', button(t('files.markdown.edit'), true)],
        ['rendered', button(t('files.markdown.preview'), true)],
        ['split', button(t('files.markdown.split'), false, ' fv-mode-split')],
      ]
    : [['source', button(t('files.svg.code'), true)]]
  const tools = h('span', { class: 'fv-tools fv-modes' }, ...buttons.map(([, element]) => element))
  for (const [value, element] of buttons)
    element.addEventListener('click', () => {
      // The SVG's one button switches between the code and the image
      void set(!markdown && mode === 'source' ? 'rendered' : value)
    })

  function previewOf(): MarkdownPreview {
    preview ??= createMarkdownPreview(rendered, {
      path: deps.path,
      texts: {
        label: t('files.markdown.label', { name: deps.path.split(/[\\/]/).pop() ?? '' }),
        remote: t('files.markdown.remote'),
        loadRemote: t('files.markdown.loadRemote'),
      },
      assets: deps.assets,
      highlight: deps.highlight,
      openLink: deps.openLink,
      openFile: deps.openFile,
      text: () => editor.text(),
    })
    return preview
  }

  async function drawImage() {
    if (!deps.url) return
    const at = ++drawn
    // The protocol reads the file again for each new address; the query only makes it new
    const loaded = await showImage({
      parent: rendered,
      url: `${deps.url}?v=${at}`,
      vector: true,
      texts: deps.imageTexts,
    })
    if (at !== drawn) {
      if (loaded.kind === 'shown') loaded.view.destroy()
      return
    }
    image?.destroy()
    image = loaded.kind === 'shown' ? loaded.view : undefined
    if (loaded.kind !== 'shown')
      rendered.replaceChildren(
        h(
          'div',
          { class: 'fv-card' },
          h('span', { class: 'fv-card-kind' }, t('files.image.failed')),
        ),
      )
    renderTools()
  }

  // An SVG's zoom shows beside its Code button while its image does
  function renderTools() {
    const zoom = image && mode === 'rendered' ? [image.tools] : []
    tools.replaceChildren(...zoom, ...buttons.map(([, element]) => element))
  }

  // The heading nearest the top of the editor, by its order among the file's headings
  function editorHeading(): number {
    const top = editor.topLine() - 1
    return headingLines(editor.text()).filter((line) => line <= top).length - 1
  }

  async function set(next: FileMode) {
    if (next === mode && (markdown ? preview : image)) return
    const from = mode
    mode = next
    body.setAttribute('data-mode', mode)
    for (const [value, element] of buttons)
      element.setAttribute('aria-pressed', String(markdown ? value === mode : mode === 'source'))
    deps.onChange()
    if (markdown) {
      if (mode === 'source') {
        // Back to the text at the heading the preview showed
        const index = preview?.topHeading() ?? -1
        const line = index < 0 ? undefined : headingLines(editor.text())[index]
        if (from === 'rendered' && line !== undefined) editor.scrollToLine(line + 1)
        editor.focus()
        return
      }
      const heading = from === 'source' ? editorHeading() : undefined
      await previewOf().render(editor.text())
      if (heading !== undefined) previewOf().showHeading(heading)
      if (mode === 'rendered') previewOf().focus()
      return
    }
    renderTools()
    if (mode === 'source') {
      editor.focus()
      return
    }
    await deps.flush()
    await drawImage()
    image?.focus()
  }

  body.setAttribute('data-mode', mode)
  for (const [value, element] of buttons)
    element.setAttribute('aria-pressed', String(markdown ? value === mode : mode === 'source'))
  // An SVG opens on its image, which takes the keys once drawn if the file still shows
  if (!markdown)
    void drawImage().then(() => {
      if (mode === 'rendered' && body.offsetParent !== null) image?.focus()
    })

  return {
    tools,
    mode: () => mode,
    set,
    // The preview key: Markdown between its text and its preview, an SVG between its image and its code
    toggle: () => set(mode === 'source' ? 'rendered' : 'source'),
    // The editor's text changed: a preview beside it follows after a pause
    textChanged() {
      if (!markdown || mode === 'source' || !preview) return
      clearTimeout(timer)
      timer = setTimeout(() => void preview?.render(editor.text()), PREVIEW_MS)
    },
    // The file was written or read again: the SVG's image shows what the disk holds
    saved() {
      if (!markdown && mode === 'rendered') void drawImage()
    },
    zoom(step: ZoomStep): boolean {
      if (!image || mode !== 'rendered') return false
      image.zoom(step)
      return true
    },
    // Whether the rendered side took the keys; false leaves them to the editor
    focus(): boolean {
      if (mode !== 'rendered') return false
      if (markdown) preview?.focus()
      else image?.focus()
      return true
    },
    destroy() {
      clearTimeout(timer)
      drawn++
      preview?.destroy()
      image?.destroy()
      rendered.remove()
    },
  }
}

export type FileModes = ReturnType<typeof createFileModes>

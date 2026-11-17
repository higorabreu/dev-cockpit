import { pathsText } from '@dck/core'

export interface DropOptions {
  // Where a dropped file lives on disk; empty when it has none
  pathOf(file: File): string
  // Types into the terminal as a paste, so a shell or an agent reads it as one block
  paste(text: string): void
  focus(): void
}

// What a drop types: the paths of dropped files and folders, quoted as VTE does, else the dropped text
export function droppedText(data: DataTransfer, pathOf: (file: File) => string): string {
  const paths = [...data.files].map(pathOf).filter((path) => path !== '')
  return paths.length > 0 ? pathsText(paths) : data.getData('text/plain')
}

// While dragging, Chromium lists only the kinds of data; the files themselves arrive on the drop
const carries = (data: DataTransfer | null) =>
  !!data &&
  (data.files.length > 0 || data.types.includes('Files') || data.types.includes('text/plain'))

// Files, folders and text dropped on a terminal are typed into it, as in Guake or GNOME Terminal; an
// image path lets an agent such as Claude Code attach the image
export function attachDrop(element: HTMLElement, options: DropOptions): { dispose(): void } {
  const controller = new AbortController()
  const { signal } = controller
  const leave = () => element.classList.remove('dropping')
  element.addEventListener(
    'dragover',
    (event) => {
      if (!carries(event.dataTransfer)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      element.classList.add('dropping')
    },
    { signal },
  )
  element.addEventListener(
    'dragleave',
    (event) => {
      if (!element.contains(event.relatedTarget as Node | null)) leave()
    },
    { signal },
  )
  element.addEventListener(
    'drop',
    (event) => {
      leave()
      if (!event.dataTransfer || !carries(event.dataTransfer)) return
      event.preventDefault()
      const text = droppedText(event.dataTransfer, options.pathOf)
      if (text === '') return
      options.paste(text)
      options.focus()
    },
    { signal },
  )
  return {
    dispose() {
      controller.abort()
      leave()
    },
  }
}

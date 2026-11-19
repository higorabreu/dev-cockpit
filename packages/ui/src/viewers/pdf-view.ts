import { h } from '../panel/dom.ts'

// A PDF over the tab, in Chromium's own viewer (`plugins` in the window): it runs in processes of its own
// that start with the frame and end with it, and the host keeps its links and downloads in check
// (shell/src/files/frame-guard.ts). Its page find, zoom, print and download are the viewer's
export function showPdf(parent: HTMLElement, url: string, label: string) {
  const frame = h('iframe', { class: 'pdf-view', src: url, 'aria-label': label })
  parent.replaceChildren(frame)
  return {
    element: frame,
    focus: () => frame.focus(),
    destroy() {
      // The viewer's processes end once the frame leaves its document
      frame.src = 'about:blank'
      frame.remove()
    },
  }
}

export type PdfView = ReturnType<typeof showPdf>

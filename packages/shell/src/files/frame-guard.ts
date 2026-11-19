import { FILE_SCHEME } from '@dck/core'

// Chromium's PDF viewer is an extension of its own, with this fixed id; its frames load from it
const PDF_VIEWER = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/'

export type FrameVerdict = 'allow' | 'external' | 'deny'

const isWeb = (url: URL | null) => url?.protocol === 'http:' || url?.protocol === 'https:'

const isOpenedFile = (url: URL | null) => url?.protocol === `${FILE_SCHEME}:` && url.host === 'open'

export const isPdfViewer = (url: string): boolean => url.startsWith(PDF_VIEWER)

// What asked a frame to navigate: the frame that started it when Chromium says, and whether a PDF shows
export interface NavigationSource {
  readonly initiator: string | undefined
  readonly pdfShown: boolean
}

// Where a frame of the page may go. A PDF the user opened (`dck-file:`) and the viewer that draws it stay
// in their frame. A web link clicked in the PDF asks to take the whole window (Chromium's viewer navigates
// the top frame, and from the browser side, so with no initiator): it opens in the system's browser
// instead, as a link in the terminal does (D40). The window itself never leaves the cockpit, and anything
// else is refused
export function frameNavigation(
  url: string,
  isMainFrame: boolean,
  source: NavigationSource,
): FrameVerdict {
  const target = URL.parse(url)
  const { initiator } = source
  if (isMainFrame) {
    const fromPdf =
      initiator === undefined
        ? source.pdfShown
        : isPdfViewer(initiator) || isOpenedFile(URL.parse(initiator))
    return fromPdf && isWeb(target) ? 'external' : 'deny'
  }
  if (url === 'about:blank' || url.startsWith(PDF_VIEWER) || isOpenedFile(target)) return 'allow'
  return isWeb(target) ? 'external' : 'deny'
}

// Only the viewer's own download button saves, and only the file it shows: through the system's dialog
export const downloadAllowed = (url: string): boolean =>
  URL.parse(url)?.protocol === `${FILE_SCHEME}:`

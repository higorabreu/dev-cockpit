import type { ErrorBody } from '../ipc/protocol.ts'
import type { FileStamp, FileStore } from '../ports/file-store.ts'
import { ok, type Result } from '../result.ts'
import { FILE_LIMITS, isSvg, kindFromHead, kindFromName } from './file-kind.ts'
import { isAnimatedImage } from './image-head.ts'
import { decodeText, type LineEnding, lineEndingOf, type TextEncoding } from './text-codec.ts'

// What the editor's text is compared with: on a save (the stamp) and on a change on disk (the text)
export interface TextBase {
  readonly text: string
  readonly stamp: FileStamp
  readonly encoding: TextEncoding
  readonly lineEnding: LineEnding
}

// Why a text opens read only: past the editable size, or not in an encoding the cockpit writes
export type ReadOnlyReason = 'large' | 'encoding'

export type OpenedFile =
  | {
      readonly kind: 'text' | 'markdown'
      readonly path: string
      readonly size: number
      readonly base: TextBase
      readonly readOnly: ReadOnlyReason | undefined
      // An SVG's address, to show it as an image beside its text
      readonly url?: string
    }
  // Drawn by the window from `url`, the cockpit's own protocol, never from the path
  | {
      readonly kind: 'image'
      readonly path: string
      readonly size: number
      readonly url: string
      // More than one frame: the window shows the first
      readonly animated: boolean
    }
  | { readonly kind: 'pdf'; readonly path: string; readonly size: number; readonly url: string }
  | { readonly kind: 'binary' | 'too-large'; readonly path: string; readonly size: number }

export interface FileOpenerDeps {
  readonly store: FileStore
  // The address the window draws an image or a PDF from
  urlOf(path: string): string
}

function readOnlyReason(encoding: TextEncoding, size: number): ReadOnlyReason | undefined {
  if (encoding === 'other') return 'encoding'
  return size > FILE_LIMITS.editableBytes ? 'large' : undefined
}

// Reads only what the kind needs: nothing for a PDF or a file past the limit, the first bytes for an image
// or a binary, the whole file for a text
export function createFileOpener(deps: FileOpenerDeps) {
  const { store } = deps
  return {
    async open(path: string): Promise<Result<OpenedFile, ErrorBody>> {
      const info = await store.stat(path)
      if (!info.ok) return info
      const { size } = info.value
      const named = kindFromName(path, size)
      if (named === 'pdf') return ok({ kind: named, path, size, url: deps.urlOf(path) })
      if (named === 'image') {
        const head = await store.head(path, FILE_LIMITS.probeBytes)
        const animated = head.ok && isAnimatedImage(head.value)
        return ok({ kind: named, path, size, url: deps.urlOf(path), animated })
      }
      if (named !== undefined) return ok({ kind: 'too-large', path, size })
      const head = await store.head(path, FILE_LIMITS.probeBytes)
      if (!head.ok) return head
      const kind = kindFromHead(path, head.value)
      if (kind === 'binary') return ok({ kind, path, size })
      const read = await store.read(path)
      if (!read.ok) return read
      const { stamp } = read.value
      const { text, encoding } = decodeText(read.value.bytes)
      const readOnly = readOnlyReason(encoding, stamp.size)
      const base = { text, stamp, encoding, lineEnding: lineEndingOf(text) }
      const url = isSvg(path) ? { url: deps.urlOf(path) } : {}
      return ok({ kind, path, size: stamp.size, base, readOnly, ...url })
    },
  }
}

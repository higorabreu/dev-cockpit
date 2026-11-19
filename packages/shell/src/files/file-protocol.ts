import { FILE_LIMITS, FILE_SCHEME, type FileStore, type Logger, mediaTypeOf } from '@dck/core'

export interface FileProtocolOptions {
  // The path the window opened under this id; undefined for any other id
  pathOf(id: string): string | undefined
  readonly store: Pick<FileStore, 'stat' | 'read'>
  readonly logger: Logger
}

// `dck-file://open/<id>`: the id the bridge gave when the file was opened, nothing a page could guess
const ADDRESS = /^\/([0-9a-f-]{1,64})$/

const refused = () => new Response(null, { status: 404 })

// Serves the bytes of an image or a PDF the user opened in this session, and nothing else: no other path,
// no folder, no remote address
export function createFileProtocol(options: FileProtocolOptions) {
  const { store, logger } = options
  return async (request: Request): Promise<Response> => {
    const url = URL.parse(request.url)
    const id =
      url?.protocol === `${FILE_SCHEME}:` && url.host === 'open'
        ? ADDRESS.exec(url.pathname)?.[1]
        : undefined
    const path = id === undefined || request.method !== 'GET' ? undefined : options.pathOf(id)
    const type = path === undefined ? undefined : mediaTypeOf(path)
    if (path === undefined || type === undefined) {
      logger.warn('file address refused')
      return refused()
    }
    // The file may have grown since it was opened
    const info = await store.stat(path)
    if (!info.ok || info.value.size > FILE_LIMITS.openBytes) return refused()
    const read = await store.read(path)
    if (!read.ok) return refused()
    return new Response(read.value.bytes, {
      headers: {
        'content-type': type,
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      },
    })
  }
}

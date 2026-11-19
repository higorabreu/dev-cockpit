import { imageTypeOf } from './file-kind.ts'

// Where a link of a Markdown preview leads: the system's browser, a heading of the same file, another
// file in the cockpit (at a line for GitHub's `#L12`), or nowhere (`javascript:`, `mailto:`, `data:`...)
export type MarkdownLink =
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'anchor'; readonly slug: string }
  | { readonly kind: 'file'; readonly path: string; readonly line?: number }
  | { readonly kind: 'none' }

// What an image of the preview draws: a file under the Markdown file's folder (through the protocol), a
// remote address (only once the user asks), an inline `data:` image, or nothing
export type MarkdownImage =
  | { readonly kind: 'local'; readonly path: string }
  | { readonly kind: 'remote'; readonly url: string }
  | { readonly kind: 'inline' }
  | { readonly kind: 'none' }

const SCHEME = /^([a-z][a-z0-9+.-]*):/i
const DRIVE = /^[a-z]:[\\/]/i

const separatorOf = (path: string) => (path.includes('\\') && !path.includes('/') ? '\\' : '/')

export function parentFolder(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at <= 0 ? path.slice(0, at + 1) || '/' : path.slice(0, at)
}

function decoded(text: string): string | undefined {
  try {
    return decodeURIComponent(text)
  } catch {
    // A stray % is not an address the file meant
    return undefined
  }
}

// `relative` against the folder, `.` and `..` resolved; undefined when it climbs above the root
function resolvePath(folder: string, relative: string): string | undefined {
  const separator = separatorOf(folder)
  const absolute = relative.startsWith('/') || DRIVE.test(relative)
  const parts = (absolute ? relative : `${folder}/${relative}`).split(/[\\/]/)
  const root = parts[0] ?? ''
  const out: string[] = []
  for (const part of parts.slice(1)) {
    if (part === '' || part === '.') continue
    if (part !== '..') out.push(part)
    else if (out.pop() === undefined) return undefined
  }
  return `${root}${separator}${out.join(separator)}`
}

export function isInside(folder: string, path: string): boolean {
  const separator = separatorOf(folder)
  const prefix = folder.endsWith(separator) ? folder : `${folder}${separator}`
  return path.startsWith(prefix)
}

// The path part of an address, its query and fragment cut, decoded
function splitAddress(address: string) {
  const hash = address.indexOf('#')
  const fragment = hash < 0 ? '' : address.slice(hash + 1)
  const beforeHash = hash < 0 ? address : address.slice(0, hash)
  const query = beforeHash.indexOf('?')
  return { path: query < 0 ? beforeHash : beforeHash.slice(0, query), fragment }
}

const isWeb = (scheme: string | undefined) => scheme === 'http' || scheme === 'https'

export function linkTarget(href: string, documentPath: string): MarkdownLink {
  const address = href.trim()
  const scheme = DRIVE.test(address) ? undefined : SCHEME.exec(address)?.[1]?.toLowerCase()
  if (scheme !== undefined)
    return isWeb(scheme) && URL.canParse(address)
      ? { kind: 'external', url: address }
      : { kind: 'none' }
  const { path, fragment } = splitAddress(address)
  if (path === '') {
    const slug = decoded(fragment)
    return slug ? { kind: 'anchor', slug: slug.toLowerCase() } : { kind: 'none' }
  }
  const relative = decoded(path)
  const resolved = relative && resolvePath(parentFolder(documentPath), relative)
  if (!resolved) return { kind: 'none' }
  const line = /^L(\d+)/.exec(fragment)?.[1]
  return { kind: 'file', path: resolved, ...(line ? { line: Number(line) } : {}) }
}

export function imageSource(src: string, documentPath: string): MarkdownImage {
  const address = src.trim()
  const scheme = DRIVE.test(address) ? undefined : SCHEME.exec(address)?.[1]?.toLowerCase()
  if (scheme === 'data')
    return /^data:image\//i.test(address) ? { kind: 'inline' } : { kind: 'none' }
  // The window's policy lets only https images in, once the user asks
  if (scheme === 'https' && URL.canParse(address)) return { kind: 'remote', url: address }
  if (scheme !== undefined) return { kind: 'none' }
  const relative = decoded(splitAddress(address).path)
  const folder = parentFolder(documentPath)
  const resolved = relative && resolvePath(folder, relative)
  if (!resolved || !isInside(folder, resolved) || imageTypeOf(resolved) === undefined)
    return { kind: 'none' }
  return { kind: 'local', path: resolved }
}

import type { DiffFile } from './diff.ts'

// FNV-1a over the UTF-16 units, 32 bits as 8 hex digits: enough to tell two versions of a text apart,
// not a security hash
export function hashText(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const SIGN = { context: ' ', add: '+', remove: '-' } as const

// A file's change as one key: the same path with other lines, another mode or size gives another key, so
// a mark tied to it ("viewed") goes away when the file changes again
export function patchKey(file: DiffFile): string {
  const lines = file.hunks.flatMap((hunk) => [
    `@${hunk.oldStart},${hunk.oldCount},${hunk.newStart},${hunk.newCount}`,
    ...hunk.lines.map((line) => SIGN[line.kind] + line.text),
  ])
  const head = [
    file.status,
    file.oldPath ?? '',
    file.oldMode ?? '',
    file.newMode ?? '',
    file.size ?? '',
  ]
  return `${file.path}\n${hashText([...head, ...lines].join('\n'))}`
}

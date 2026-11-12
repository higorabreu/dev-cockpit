// A block the tool owns inside a file the user owns: only the lines between the markers are ever touched
export interface BlockStyle {
  readonly start: string
  readonly end: string
}

export const MARKDOWN_BLOCK: BlockStyle = { start: '<!-- dck:start -->', end: '<!-- dck:end -->' }
export const SHELL_BLOCK: BlockStyle = { start: '# dck:start', end: '# dck:end' }

function find(lines: readonly string[], style: BlockStyle) {
  // Trimmed so a file with Windows line endings still shows its block
  const start = lines.findIndex((line) => line.trim() === style.start)
  const end = lines.findIndex((line, index) => index > start && line.trim() === style.end)
  return start === -1 || end === -1 ? undefined : { start, end }
}

const endWithOneNewline = (text: string) => text.replace(/\n*$/, '\n')

export const hasBlock = (text: string, style: BlockStyle) =>
  find(text.split('\n'), style) !== undefined

export function upsertBlock(text: string, block: string, style: BlockStyle): string {
  const managed = [style.start, block.trim(), style.end]
  const lines = text.split('\n')
  const found = find(lines, style)
  if (found === undefined) {
    const before = text.trimEnd()
    return `${before === '' ? '' : `${before}\n\n`}${managed.join('\n')}\n`
  }
  lines.splice(found.start, found.end - found.start + 1, ...managed)
  return endWithOneNewline(lines.join('\n'))
}

export function removeBlock(text: string, style: BlockStyle): string {
  const lines = text.split('\n')
  const found = find(lines, style)
  if (found === undefined) return text
  // The blank line before the block is the one upsertBlock added
  const from = lines[found.start - 1]?.trim() === '' ? found.start - 1 : found.start
  lines.splice(from, found.end - from + 1)
  const rest = lines.join('\n')
  return rest.trim() === '' ? '' : endWithOneNewline(rest)
}

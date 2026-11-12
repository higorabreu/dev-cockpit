// A block the tool owns inside a file the user owns: only the lines between the markers are ever touched
const START = '<!-- dck:start -->'
const END = '<!-- dck:end -->'

// Each end pairs with the nearest start before it, so a stray start never widens the block over user text
function find(lines: readonly string[]) {
  let fenced = false
  let start = -1
  for (const [index, line] of lines.entries()) {
    // Trimmed so a file with Windows line endings still shows its block
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) fenced = !fenced
    else if (fenced) continue
    else if (trimmed === START) start = index
    else if (trimmed === END && start !== -1) return { start, end: index }
  }
  return undefined
}

const endWithOneNewline = (text: string) => text.replace(/\n*$/, '\n')

export const hasBlock = (text: string) => find(text.split('\n')) !== undefined

export function upsertBlock(text: string, block: string): string {
  const managed = [START, block.trim(), END]
  const lines = text.split('\n')
  const found = find(lines)
  if (found === undefined) {
    const before = text.trimEnd()
    return `${before === '' ? '' : `${before}\n\n`}${managed.join('\n')}\n`
  }
  const current = lines.slice(found.start, found.end + 1).map((line) => line.replace(/\r$/, ''))
  if (current.join('\n') === managed.join('\n')) return text
  lines.splice(found.start, found.end - found.start + 1, ...managed)
  return lines.join('\n')
}

export function removeBlock(text: string): string {
  const lines = text.split('\n')
  const found = find(lines)
  if (found === undefined) return text
  // The blank line before the block is the one upsertBlock added
  const from = lines[found.start - 1]?.trim() === '' ? found.start - 1 : found.start
  lines.splice(from, found.end - from + 1)
  const rest = lines.join('\n')
  return rest.trim() === '' ? '' : endWithOneNewline(rest)
}

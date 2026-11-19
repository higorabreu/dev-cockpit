// What the editor takes from `.editorconfig` (editorconfig.org): the indentation and the final newline
export interface EditorConfig {
  readonly indentStyle?: 'tab' | 'space'
  readonly indentSize?: number
  readonly tabWidth?: number
  readonly insertFinalNewline?: boolean
}

// One `.editorconfig` file, by the folder it sits in
export interface EditorConfigFile {
  readonly dir: string
  readonly text: string
}

interface Section {
  readonly glob: string
  readonly properties: ReadonlyMap<string, string>
}

interface ParsedConfig {
  readonly root: boolean
  readonly sections: readonly Section[]
}

const SECTION = /^\[(.+)\]$/
const PAIR = /^([^=:]+?)\s*[=:]\s*(.*)$/

export function parseEditorConfig(text: string): ParsedConfig {
  let root = false
  const sections: Section[] = []
  let current: Map<string, string> | undefined
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue
    const section = SECTION.exec(line)
    if (section) {
      current = new Map()
      sections.push({ glob: section[1] ?? '', properties: current })
      continue
    }
    const pair = PAIR.exec(line)
    if (!pair) continue
    const key = (pair[1] ?? '').trim().toLowerCase()
    const value = (pair[2] ?? '').trim()
    if (current) current.set(key, value.toLowerCase())
    else if (key === 'root') root = value.toLowerCase() === 'true'
  }
  return { root, sections }
}

const slash = (path: string) => path.replaceAll('\\', '/')

const escapeRegex = (text: string) => text.replace(/[.+^$()|\\/]/g, '\\$&')

// `{1..3}` as an alternation of the numbers, bounded so a wide range cannot build a huge pattern
function numberRange(from: number, to: number): string | undefined {
  const [low, high] = from <= to ? [from, to] : [to, from]
  if (high - low > 1000) return undefined
  return Array.from({ length: high - low + 1 }, (_, index) => String(low + index)).join('|')
}

// The glob syntax of editorconfig.org: `*`, `**`, `?`, `[set]`, `[!set]`, `{a,b}` and `{1..3}`
export function globToRegex(glob: string): RegExp {
  let out = ''
  let braces = 0
  for (let index = 0; index < glob.length; index++) {
    const char = glob[index] ?? ''
    if (char === '*') {
      const double = glob[index + 1] === '*'
      out += double ? '.*' : '[^/]*'
      if (double) index++
    } else if (char === '?') out += '[^/]'
    else if (char === '[') {
      const end = glob.indexOf(']', index + 1)
      if (end < 0) out += '\\['
      else {
        const body = glob.slice(index + 1, end)
        out += body.startsWith('!') ? `[^${body.slice(1)}]` : `[${body}]`
        index = end
      }
    } else if (char === '{') {
      const end = glob.indexOf('}', index + 1)
      const body = end < 0 ? '' : glob.slice(index + 1, end)
      const range = /^(-?\d+)\.\.(-?\d+)$/.exec(body)
      const numbers = range ? numberRange(Number(range[1]), Number(range[2])) : undefined
      if (numbers !== undefined) {
        out += `(?:${numbers})`
        index = end
      } else if (end >= 0 && body.includes(',')) {
        out += '(?:'
        braces++
      } else out += '\\{'
    } else if (char === '}' && braces > 0) {
      out += ')'
      braces--
    } else if (char === ',' && braces > 0) out += '|'
    else out += escapeRegex(char)
  }
  return new RegExp(`^${out}$`)
}

// A glob with no slash matches the name in any folder below the file's; with one, from that folder
function sectionMatches(glob: string, relative: string): boolean {
  const anchored = glob.includes('/')
  const pattern = anchored ? glob.replace(/^\//, '') : `**/${glob}`
  return globToRegex(pattern).test(relative) || (!anchored && globToRegex(glob).test(relative))
}

const positive = (value: string | undefined) => {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 && number <= 16 ? number : undefined
}

function settle(properties: ReadonlyMap<string, string>): EditorConfig {
  const style = properties.get('indent_style')
  const size = properties.get('indent_size')
  const tabWidth = positive(properties.get('tab_width')) ?? positive(size)
  const indentSize = size === 'tab' ? tabWidth : positive(size)
  const finalNewline = properties.get('insert_final_newline')
  return {
    ...(style === 'tab' || style === 'space' ? { indentStyle: style } : {}),
    ...(indentSize === undefined ? {} : { indentSize }),
    ...(tabWidth === undefined ? {} : { tabWidth }),
    ...(finalNewline === 'true' || finalNewline === 'false'
      ? { insertFinalNewline: finalNewline === 'true' }
      : {}),
  }
}

// The file's settings from the `.editorconfig` files above it, the nearest first as they were found: the
// walk stops at one marked `root`, and a nearer file and a later section win
export function editorConfigFor(path: string, files: readonly EditorConfigFile[]): EditorConfig {
  // The globs use slashes on every system
  const file = slash(path)
  const parsed = files.map((file) => ({ dir: file.dir, config: parseEditorConfig(file.text) }))
  const rootAt = parsed.findIndex((file) => file.config.root)
  const used = (rootAt < 0 ? parsed : parsed.slice(0, rootAt + 1)).reverse()
  const properties = new Map<string, string>()
  for (const { dir, config } of used) {
    const folder = slash(dir)
    const prefix = folder.endsWith('/') ? folder : `${folder}/`
    if (!file.startsWith(prefix)) continue
    const relative = file.slice(prefix.length)
    for (const section of config.sections) {
      if (!sectionMatches(section.glob, relative)) continue
      for (const [key, value] of section.properties) properties.set(key, value)
    }
  }
  return settle(properties)
}

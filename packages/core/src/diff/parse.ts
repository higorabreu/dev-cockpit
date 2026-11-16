import {
  type DiffFile,
  type DiffFileStatus,
  type DiffHunk,
  type DiffLine,
  isGeneratedPath,
} from './diff.ts'

const SUBMODULE_MODE = '160000'
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/
const REPLACEMENT = '�'
const ESCAPES: Readonly<Record<string, string>> = {
  a: '\x07',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '"': '"',
  '\\': '\\',
}

// Git quotes a name with special characters like C does, octal escapes being the bytes of UTF-8
export function unquotePath(text: string): string {
  if (!text.startsWith('"') || !text.endsWith('"') || text.length < 2) return text
  const body = text.slice(1, -1)
  let encoded = ''
  for (let index = 0; index < body.length; index++) {
    const char = body[index] ?? ''
    if (char !== '\\') {
      encoded += encodeURIComponent(char)
      continue
    }
    const next = body[index + 1] ?? ''
    const octal = /^[0-7]{3}/.exec(body.slice(index + 1))?.[0]
    if (octal !== undefined) {
      encoded += `%${Number.parseInt(octal, 8).toString(16).padStart(2, '0')}`
      index += 3
    } else {
      encoded += encodeURIComponent(ESCAPES[next] ?? next)
      index += 1
    }
  }
  try {
    return decodeURIComponent(encoded)
  } catch {
    // Bytes that are not UTF-8 stay visible as the quoted name instead of failing the whole diff
    return body
  }
}

// A name on a `---`, `+++`, `rename` or `copy` line: quoted or bare, with a tab after it when it has a space
function nameOf(text: string, prefix: string): string | undefined {
  const raw = text.endsWith('\t') ? text.slice(0, -1) : text
  if (raw === '/dev/null') return undefined
  const name = unquotePath(raw)
  return prefix !== '' && name.startsWith(prefix) ? name.slice(prefix.length) : name
}

// `diff --git a/x b/y` is only read when no other line names the file (a binary or a mode change)
function namesOfHeader(rest: string): { old: string; new: string } | undefined {
  if (rest.startsWith('"')) {
    const end = rest.indexOf('" ', 1)
    if (end === -1) return undefined
    const old = nameOf(rest.slice(0, end + 1), 'a/')
    const next = nameOf(rest.slice(end + 2), 'b/')
    return old !== undefined && next !== undefined ? { old, new: next } : undefined
  }
  // Same name on both sides, the usual case: "a/<name> b/<name>"
  const length = (rest.length - 5) / 2
  if (Number.isInteger(length) && length > 0) {
    const old = rest.slice(2, 2 + length)
    if (rest.startsWith('a/') && rest.slice(2 + length) === ` b/${old}`) return { old, new: old }
  }
  const split = rest.indexOf(' b/')
  if (!rest.startsWith('a/') || split === -1) return undefined
  return { old: rest.slice(2, split), new: nameOf(rest.slice(split + 1), 'b/') ?? '' }
}

interface FileDraft {
  header: { old: string; new: string } | undefined
  oldName: string | undefined
  newName: string | undefined
  renamedFrom: string | undefined
  renamedTo: string | undefined
  status: DiffFileStatus
  oldMode: string | undefined
  newMode: string | undefined
  binary: boolean
  submodule: boolean
  hunks: DiffHunk[]
}

const draft = (rest: string): FileDraft => ({
  header: namesOfHeader(rest),
  oldName: undefined,
  newName: undefined,
  renamedFrom: undefined,
  renamedTo: undefined,
  status: 'modified',
  oldMode: undefined,
  newMode: undefined,
  binary: false,
  submodule: false,
  hunks: [],
})

function finish(file: FileDraft): DiffFile {
  const oldPath = file.renamedFrom ?? file.oldName ?? file.header?.old
  const newPath = file.renamedTo ?? file.newName ?? file.header?.new
  const path = (file.status === 'deleted' ? oldPath : newPath) ?? oldPath ?? ''
  let additions = 0
  let deletions = 0
  let crlf = false
  let nonUtf8 = false
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'add') additions += 1
      else if (line.kind === 'remove') deletions += 1
      if (line.text.includes(REPLACEMENT)) nonUtf8 = true
      if ((line as DraftLine).crlf) crlf = true
    }
  }
  const moved = file.status === 'renamed' || file.status === 'copied'
  return {
    path,
    oldPath: moved ? oldPath : undefined,
    status: file.status,
    oldMode: file.oldMode,
    newMode: file.newMode,
    binary: file.binary || nonUtf8,
    nonUtf8,
    submodule: file.submodule,
    crlf,
    generated: isGeneratedPath(path),
    untracked: false,
    additions,
    deletions,
    // Text that is not UTF-8 is not drawn, so its lines are not carried around
    hunks: nonUtf8 ? [] : file.hunks.map(cleanHunk),
  }
}

interface DraftLine extends DiffLine {
  crlf?: boolean
}

const cleanHunk = (hunk: DiffHunk): DiffHunk => ({
  ...hunk,
  lines: hunk.lines.map((line) => {
    const { crlf: _crlf, ...rest } = line as DraftLine
    return rest
  }),
})

function readHeaderLine(file: FileDraft, line: string) {
  const value = (prefix: string) => line.slice(prefix.length)
  if (line.startsWith('new file mode ')) {
    file.status = 'added'
    file.submodule ||= value('new file mode ') === SUBMODULE_MODE
  } else if (line.startsWith('deleted file mode ')) {
    file.status = 'deleted'
    file.submodule ||= value('deleted file mode ') === SUBMODULE_MODE
  } else if (line.startsWith('old mode ')) file.oldMode = value('old mode ')
  else if (line.startsWith('new mode ')) file.newMode = value('new mode ')
  else if (line.startsWith('rename from ')) {
    file.status = 'renamed'
    file.renamedFrom = nameOf(value('rename from '), '')
  } else if (line.startsWith('rename to ')) file.renamedTo = nameOf(value('rename to '), '')
  else if (line.startsWith('copy from ')) {
    file.status = 'copied'
    file.renamedFrom = nameOf(value('copy from '), '')
  } else if (line.startsWith('copy to ')) file.renamedTo = nameOf(value('copy to '), '')
  else if (line.startsWith('index ')) file.submodule ||= line.endsWith(` ${SUBMODULE_MODE}`)
  else if (line.startsWith('--- ')) file.oldName = nameOf(value('--- '), 'a/')
  else if (line.startsWith('+++ ')) file.newName = nameOf(value('+++ '), 'b/')
  else if (line.startsWith('Binary files ') || line === 'GIT binary patch') file.binary = true
}

// Reads `git diff` output (unified, no color) into files, hunks and lines. The counts of each hunk say
// where it ends, so a content line that looks like a header (a removed "--- x") is never taken for one
export function parseUnifiedDiff(text: string): readonly DiffFile[] {
  const files: DiffFile[] = []
  let file: FileDraft | undefined
  let lines: DraftLine[] = []
  let oldLeft = 0
  let newLeft = 0
  let oldLine = 0
  let newLine = 0

  const close = () => {
    if (file) files.push(finish(file))
    file = undefined
  }

  for (const raw of text.split('\n')) {
    const inHunk = oldLeft > 0 || newLeft > 0
    if (file && inHunk && raw !== '' && ' +-'.includes(raw[0] ?? '')) {
      const crlf = raw.endsWith('\r')
      const content = raw.slice(1, crlf ? -1 : undefined)
      const sign = raw[0]
      const line: DraftLine =
        sign === '+'
          ? { kind: 'add', text: content, old: undefined, new: newLine++ }
          : sign === '-'
            ? { kind: 'remove', text: content, old: oldLine++, new: undefined }
            : { kind: 'context', text: content, old: oldLine++, new: newLine++ }
      if (crlf) line.crlf = true
      if (sign !== '+') oldLeft -= 1
      if (sign !== '-') newLeft -= 1
      lines.push(line)
      continue
    }
    // Some tools strip the space of an empty context line
    if (file && inHunk && raw === '') {
      lines.push({ kind: 'context', text: '', old: oldLine++, new: newLine++ })
      oldLeft -= 1
      newLeft -= 1
      continue
    }
    if (raw.startsWith('\\')) {
      const last = lines.at(-1)
      if (last) lines[lines.length - 1] = { ...last, noNewline: true }
      continue
    }
    if (raw.startsWith('diff --git ')) {
      close()
      file = draft(raw.slice('diff --git '.length))
      continue
    }
    if (!file) continue
    const hunk = HUNK_HEADER.exec(raw)
    if (hunk) {
      const [, oldStart = '0', oldCount = '1', newStart = '0', newCount = '1', section = ''] = hunk
      lines = []
      oldLine = Number(oldStart)
      newLine = Number(newStart)
      oldLeft = Number(oldCount)
      newLeft = Number(newCount)
      file.hunks.push({
        oldStart: oldLine,
        oldCount: oldLeft,
        newStart: newLine,
        newCount: newLeft,
        section: section.trim(),
        lines,
      })
      continue
    }
    if (file.hunks.length === 0) readHeaderLine(file, raw)
  }
  close()
  return files
}

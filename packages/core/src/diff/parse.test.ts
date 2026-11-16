import { describe, expect, it } from 'vitest'
import { collapseReason, type DiffFile, isGeneratedPath, LARGE_FILE_LINES } from './diff.ts'
import { parseUnifiedDiff, unquotePath } from './parse.ts'

const lines = (...rows: string[]) => `${rows.join('\n')}\n`

const only = (text: string): DiffFile => {
  const [file] = parseUnifiedDiff(text)
  if (!file) throw new Error('invariant: no file parsed')
  return file
}

describe('parseUnifiedDiff', () => {
  it('should read the hunks and number each side when a file was modified', () => {
    const file = only(
      lines(
        'diff --git a/src/app.ts b/src/app.ts',
        'index 3b18e51..b1e6722 100644',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -10,4 +10,4 @@ export function start(options: Options) {',
        '   const one = 1',
        '-  const two = 2',
        '+  const two = 3',
        '   const three = 3',
        '   return one',
      ),
    )

    expect(file).toMatchObject({
      path: 'src/app.ts',
      status: 'modified',
      additions: 1,
      deletions: 1,
    })
    expect(file.hunks).toHaveLength(1)
    expect(file.hunks[0]?.section).toBe('export function start(options: Options) {')
    expect(file.hunks[0]?.lines.map((line) => [line.kind, line.old, line.new])).toEqual([
      ['context', 10, 10],
      ['remove', 11, undefined],
      ['add', undefined, 11],
      ['context', 12, 12],
      ['context', 13, 13],
    ])
  })

  it('should take a removed line that looks like a header as content when it is inside a hunk', () => {
    const file = only(
      lines(
        'diff --git a/notes.md b/notes.md',
        '--- a/notes.md',
        '+++ b/notes.md',
        '@@ -1,2 +1,1 @@',
        '--- a/old',
        ' kept',
      ),
    )

    expect(file.hunks[0]?.lines.map((line) => [line.kind, line.text])).toEqual([
      ['remove', '-- a/old'],
      ['context', 'kept'],
    ])
  })

  it('should split the files when the diff has several', () => {
    const files = parseUnifiedDiff(
      lines(
        'diff --git a/a.txt b/a.txt',
        '--- a/a.txt',
        '+++ b/a.txt',
        '@@ -1 +1 @@',
        '-a',
        '+b',
        'diff --git a/b.txt b/b.txt',
        '--- a/b.txt',
        '+++ b/b.txt',
        '@@ -1 +1,2 @@',
        ' b',
        '+c',
      ),
    )

    expect(files.map((file) => [file.path, file.additions, file.deletions])).toEqual([
      ['a.txt', 1, 1],
      ['b.txt', 1, 0],
    ])
  })

  it('should mark an added and a deleted file when one side is /dev/null', () => {
    const files = parseUnifiedDiff(
      lines(
        'diff --git a/new.py b/new.py',
        'new file mode 100644',
        'index 0000000..e69de29',
        '--- /dev/null',
        '+++ b/new.py',
        '@@ -0,0 +1,2 @@',
        '+def main():',
        '+    pass',
        'diff --git a/gone.py b/gone.py',
        'deleted file mode 100644',
        '--- a/gone.py',
        '+++ /dev/null',
        '@@ -1 +0,0 @@',
        '-print(1)',
      ),
    )

    expect(files.map((file) => [file.path, file.status])).toEqual([
      ['new.py', 'added'],
      ['gone.py', 'deleted'],
    ])
    expect(files[0]?.hunks[0]?.lines.map((line) => line.new)).toEqual([1, 2])
  })

  it('should keep where a file came from when Git detected a rename', () => {
    const file = only(
      lines(
        'diff --git a/src/old name.ts b/src/new name.ts',
        'similarity index 92%',
        'rename from src/old name.ts',
        'rename to src/new name.ts',
        'index 1111111..2222222 100644',
        '--- a/src/old name.ts\t',
        '+++ b/src/new name.ts\t',
        '@@ -1 +1 @@',
        '-a',
        '+b',
      ),
    )

    expect(file).toMatchObject({
      path: 'src/new name.ts',
      oldPath: 'src/old name.ts',
      status: 'renamed',
    })
  })

  it('should name a pure rename from its rename lines when it has no hunk', () => {
    const file = only(
      lines(
        'diff --git a/docs/a.md b/guide/a.md',
        'similarity index 100%',
        'rename from docs/a.md',
        'rename to guide/a.md',
      ),
    )

    expect(file).toMatchObject({ path: 'guide/a.md', oldPath: 'docs/a.md', hunks: [] })
  })

  it('should keep both modes when only the mode changed', () => {
    const file = only(lines('diff --git a/run.sh b/run.sh', 'old mode 100644', 'new mode 100755'))

    expect(file).toMatchObject({ path: 'run.sh', oldMode: '100644', newMode: '100755', hunks: [] })
  })

  it('should mark a binary file and name it from the header when Git shows no text', () => {
    const file = only(
      lines(
        'diff --git a/assets/logo.png b/assets/logo.png',
        'index 5d3c8b1..9a2f0e4 100644',
        'Binary files a/assets/logo.png and b/assets/logo.png differ',
      ),
    )

    expect(file).toMatchObject({ path: 'assets/logo.png', binary: true, additions: 0 })
  })

  it('should treat the text as binary when it is not UTF-8', () => {
    const file = only(
      lines(
        'diff --git a/legacy.txt b/legacy.txt',
        '--- a/legacy.txt',
        '+++ b/legacy.txt',
        '@@ -1 +1 @@',
        '-caf�',
        '+caf�!',
      ),
    )

    expect(file).toMatchObject({ binary: true, nonUtf8: true, hunks: [], additions: 1 })
  })

  it('should strip the carriage return and say so when the file has CRLF line endings', () => {
    const file = only(
      lines(
        'diff --git a/win.txt b/win.txt',
        '--- a/win.txt',
        '+++ b/win.txt',
        '@@ -1,2 +1,2 @@',
        ' first\r',
        '-second\r',
        '+Second\r',
      ),
    )

    expect(file.crlf).toBe(true)
    expect(file.hunks[0]?.lines.map((line) => line.text)).toEqual(['first', 'second', 'Second'])
  })

  it('should note the missing newline on the line before the marker', () => {
    const file = only(
      lines(
        'diff --git a/a.txt b/a.txt',
        '--- a/a.txt',
        '+++ b/a.txt',
        '@@ -1 +1 @@',
        '-a',
        '\\ No newline at end of file',
        '+a',
      ),
    )

    expect(file.hunks[0]?.lines.map((line) => line.noNewline === true)).toEqual([true, false])
  })

  it('should mark a submodule when its mode is 160000', () => {
    const file = only(
      lines(
        'diff --git a/vendor/lib b/vendor/lib',
        'index 1234567..89abcde 160000',
        '--- a/vendor/lib',
        '+++ b/vendor/lib',
        '@@ -1 +1 @@',
        '-Subproject commit 1234567',
        '+Subproject commit 89abcde',
      ),
    )

    expect(file.submodule).toBe(true)
  })

  it('should decode a quoted name with octal bytes when Git escaped it', () => {
    const file = only(
      lines(
        'diff --git "a/caf\\303\\251 \\"x\\".txt" "b/caf\\303\\251 \\"x\\".txt"',
        'new file mode 100644',
        '--- /dev/null',
        '+++ "b/caf\\303\\251 \\"x\\".txt"',
        '@@ -0,0 +1 @@',
        '+x',
      ),
    )

    expect(file.path).toBe('café "x".txt')
  })

  it('should read a hunk header without counts as one line when Git omits them', () => {
    const file = only(lines('diff --git a/a b/a', '--- a/a', '+++ b/a', '@@ -3 +3 @@', '-x', '+y'))

    expect(file.hunks[0]).toMatchObject({ oldStart: 3, oldCount: 1, newStart: 3, newCount: 1 })
  })

  it('should give nothing when the diff is empty', () => {
    expect(parseUnifiedDiff('')).toEqual([])
  })
})

describe('unquotePath', () => {
  it('should leave a bare name as it is when it has no quotes', () => {
    expect(unquotePath('src/a b.ts')).toBe('src/a b.ts')
  })

  it('should turn the C escapes into characters when the name is quoted', () => {
    expect(unquotePath('"a\\tb\\\\c"')).toBe('a\tb\\c')
  })
})

describe('isGeneratedPath', () => {
  it.each([
    'pnpm-lock.yaml',
    'web/package-lock.json',
    'Cargo.lock',
    'packages/ui/dist/index.js',
    'static/app.min.js',
    'static/app.js.map',
  ])('should treat %s as generated when a review lists it', (path) => {
    expect(isGeneratedPath(path)).toBe(true)
  })

  it.each(['src/lock.ts', 'distance.ts', 'docs/dist.md'])(
    'should treat %s as written by hand when a review lists it',
    (path) => {
      expect(isGeneratedPath(path)).toBe(false)
    },
  )
})

describe('collapseReason', () => {
  const base = only(
    lines('diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1 +1 @@', '-a', '+b'),
  )

  it('should collapse a generated file when it is listed', () => {
    expect(collapseReason({ ...base, generated: true })).toBe('generated')
  })

  it('should collapse a file when it changed more lines than the limit', () => {
    expect(collapseReason({ ...base, additions: LARGE_FILE_LINES + 1 })).toBe('large')
    expect(collapseReason(base)).toBeUndefined()
  })
})

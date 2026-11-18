import { describe, expect, it } from 'vitest'
import type { DiffFile, DiffModule } from './diff.ts'
import {
  indexRowOf,
  indexRows,
  modulePath,
  orderModuleFiles,
  parentModule,
  subprojectCommits,
} from './modules.ts'
import { parseUnifiedDiff } from './parse.ts'

const file = (path: string, module?: string): DiffFile => ({
  path,
  oldPath: undefined,
  status: 'modified',
  oldMode: undefined,
  newMode: undefined,
  binary: false,
  nonUtf8: false,
  submodule: false,
  crlf: false,
  generated: false,
  untracked: false,
  additions: 1,
  deletions: 0,
  hunks: [],
  ...(module === undefined ? {} : { module }),
})

const module = (path: string, commits: readonly string[] = []): DiffModule => ({
  path,
  commits,
  commitCount: commits.length,
})

const modules = [module('libs/other'), module('libs/lib/vendor/deep'), module('libs/lib')]

const change = () =>
  orderModuleFiles(
    [
      file('libs/other/docs/guide.md', 'libs/other'),
      file('src/main.ts'),
      file('libs/lib/vendor/deep/src/deep.txt', 'libs/lib/vendor/deep'),
      file('libs/lib/x.txt', 'libs/lib'),
      file('app.ts'),
      file('libs/lib/src/util.ts', 'libs/lib'),
    ],
    modules,
  )

describe('subprojectCommits', () => {
  it('should read both commits when a submodule moved and has edits', () => {
    const [entry] = parseUnifiedDiff(
      [
        'diff --git a/libs/lib b/libs/lib',
        'index b79ac86..8e77ab1 160000',
        '--- a/libs/lib',
        '+++ b/libs/lib',
        '@@ -1 +1 @@',
        '-Subproject commit b79ac86ba9b62219b0d5ecb0d31bbfc7c3c24b62',
        '+Subproject commit 8e77ab1759f73c4de03a5847c3605e72aaeb69bd-dirty',
        '',
      ].join('\n'),
    )

    const commits = entry && subprojectCommits(entry)

    expect(commits).toEqual({
      old: 'b79ac86ba9b62219b0d5ecb0d31bbfc7c3c24b62',
      new: '8e77ab1759f73c4de03a5847c3605e72aaeb69bd',
    })
  })

  it('should have no old commit when the submodule is new', () => {
    const [entry] = parseUnifiedDiff(
      [
        'diff --git a/libs/new b/libs/new',
        'new file mode 160000',
        'index 0000000..409f475',
        '--- /dev/null',
        '+++ b/libs/new',
        '@@ -0,0 +1 @@',
        '+Subproject commit 409f475ec419d1bb65ba5020f5b0ea11d512f6ec',
        '',
      ].join('\n'),
    )

    expect(entry && subprojectCommits(entry)).toEqual({
      old: undefined,
      new: '409f475ec419d1bb65ba5020f5b0ea11d512f6ec',
    })
  })
})

describe('parentModule', () => {
  it('should pick the closest submodule when a submodule is nested in another', () => {
    const paths = modules.map((entry) => entry.path)

    expect(parentModule('libs/lib/vendor/deep', paths)).toBe('libs/lib')
    expect(parentModule('libs/lib', paths)).toBeUndefined()
    expect(parentModule('libs/lib-extra', ['libs/lib'])).toBeUndefined()
  })
})

describe('orderModuleFiles', () => {
  it('should put the own files first and each submodule after, depth first, when files are mixed', () => {
    const ordered = change().map((entry) => entry.path)

    expect(ordered).toEqual([
      'app.ts',
      'src/main.ts',
      'libs/lib/src/util.ts',
      'libs/lib/x.txt',
      'libs/lib/vendor/deep/src/deep.txt',
      'libs/other/docs/guide.md',
    ])
  })

  it('should keep a nested submodule after its parent when a sibling folder sorts between them', () => {
    const ordered = orderModuleFiles(
      [file('libs/lib-extra/a.ts', 'libs/lib-extra'), file('libs/lib/sub/b.ts', 'libs/lib/sub')],
      [module('libs/lib'), module('libs/lib-extra'), module('libs/lib/sub')],
    )

    expect(ordered.map((entry) => entry.path)).toEqual(['libs/lib/sub/b.ts', 'libs/lib-extra/a.ts'])
  })
})

describe('modulePath', () => {
  it('should give the path inside the submodule when the file belongs to one', () => {
    expect(modulePath(file('libs/lib/src/util.ts', 'libs/lib'))).toBe('src/util.ts')
    expect(modulePath(file('app.ts'))).toBe('app.ts')
  })
})

describe('indexRows', () => {
  it('should list the own files and then a header per submodule with its files under it', () => {
    const rows = indexRows(change(), modules, new Set())

    expect(
      rows.map((row) =>
        row.kind === 'file'
          ? `${row.depth} file ${row.file}`
          : `${row.depth} module ${row.module.path} ${row.count} ${row.first}`,
      ),
    ).toEqual([
      '0 file 0',
      '0 file 1',
      '0 module libs/lib 3 2',
      '1 file 2',
      '1 file 3',
      '1 module libs/lib/vendor/deep 1 4',
      '2 file 4',
      '0 module libs/other 1 5',
      '1 file 5',
    ])
  })

  it('should hide everything under a header when the submodule is collapsed', () => {
    const rows = indexRows(change(), modules, new Set(['libs/lib']))

    expect(rows.map((row) => (row.kind === 'file' ? row.file : row.module.path))).toEqual([
      0,
      1,
      'libs/lib',
      'libs/other',
      5,
    ])
    expect(rows[2]).toMatchObject({ kind: 'module', collapsed: true, count: 3 })
  })

  it('should show a header with no file when a submodule only has new commits', () => {
    const rows = indexRows([file('app.ts')], [module('libs/lib', ['Fix the parser'])], new Set())

    expect(rows[1]).toMatchObject({ kind: 'module', count: 0, first: undefined })
  })
})

describe('indexRowOf', () => {
  it('should point at the outermost collapsed header when the file is hidden', () => {
    const files = change()
    const rows = indexRows(files, modules, new Set(['libs/lib', 'libs/lib/vendor/deep']))

    expect(indexRowOf(rows, files, 4)).toBe(2)
    expect(indexRowOf(rows, files, 5)).toBe(4)
    expect(indexRowOf(rows, files, 1)).toBe(1)
  })
})

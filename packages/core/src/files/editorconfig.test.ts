import { describe, expect, it } from 'vitest'
import { editorConfigFor, globToRegex, parseEditorConfig } from './editorconfig.ts'

describe('editorconfig', () => {
  it('should read the root flag and the sections when parsing a file with comments', () => {
    // Arrange
    const text = '# top\nroot = true\n\n[*.ts]\nindent_style = space\n; note\nindent_size = 2\n'

    // Act
    const parsed = parseEditorConfig(text)

    // Assert
    expect(parsed.root).toBe(true)
    expect(parsed.sections).toHaveLength(1)
    expect(Object.fromEntries(parsed.sections[0]?.properties ?? [])).toEqual({
      indent_style: 'space',
      indent_size: '2',
    })
  })

  it.each([
    ['*.ts', 'login.ts', true],
    ['*.ts', 'src/login.ts', false],
    ['**.ts', 'src/login.ts', true],
    ['*.{js,ts}', 'login.js', true],
    ['*.{js,ts}', 'login.py', false],
    ['file{1..3}.txt', 'file2.txt', true],
    ['file{1..3}.txt', 'file4.txt', false],
    ['[mM]akefile', 'Makefile', true],
    ['[!m]akefile', 'makefile', false],
    ['?.md', 'a.md', true],
  ])(
    'should match %s against %s as %s when turning the glob into a pattern',
    (glob, path, matches) => {
      expect(globToRegex(glob).test(path)).toBe(matches)
    },
  )

  it('should take a nearer file over a farther one when both match the file', () => {
    // Arrange
    const files = [
      { dir: '/home/ana/acme/src', text: '[*.ts]\nindent_size = 4\n' },
      {
        dir: '/home/ana/acme',
        text: 'root = true\n[*]\nindent_style = space\nindent_size = 2\ninsert_final_newline = true\n',
      },
      { dir: '/home/ana', text: '[*]\nindent_style = tab\n' },
    ]

    // Act
    const config = editorConfigFor('/home/ana/acme/src/login.ts', files)

    // Assert
    expect(config).toEqual({
      indentStyle: 'space',
      indentSize: 4,
      tabWidth: 4,
      insertFinalNewline: true,
    })
  })

  it('should match a glob with a slash from its own folder when the file is deeper', () => {
    // Arrange
    const files = [
      {
        dir: '/home/ana/acme',
        text: '[src/**.py]\nindent_size = 4\n[lib/*.py]\nindent_size = 8\n',
      },
    ]

    // Act
    const inSrc = editorConfigFor('/home/ana/acme/src/app/main.py', files)
    const inOther = editorConfigFor('/home/ana/acme/other/lib/main.py', files)

    // Assert
    expect(inSrc.indentSize).toBe(4)
    expect(inOther.indentSize).toBeUndefined()
  })

  it('should use the tab width as the indent size when the size says tab', () => {
    const config = editorConfigFor('/a/b.go', [
      { dir: '/a', text: '[*.go]\nindent_style = tab\nindent_size = tab\ntab_width = 8\n' },
    ])

    expect(config).toEqual({ indentStyle: 'tab', indentSize: 8, tabWidth: 8 })
  })

  it('should ignore values it does not understand when settling the properties', () => {
    const config = editorConfigFor('/a/b.ts', [
      {
        dir: '/a',
        text: '[*]\nindent_style = wide\nindent_size = huge\ninsert_final_newline = maybe\n',
      },
    ])

    expect(config).toEqual({})
  })

  it('should match folders written with backslashes when the system uses them', () => {
    const config = editorConfigFor('C:\\work\\acme\\login.ts', [
      { dir: 'C:\\work\\acme', text: '[*.ts]\nindent_size = 3\n' },
    ])

    expect(config.indentSize).toBe(3)
  })
})

import { describe, expect, it } from 'vitest'
import { createJsoncSettingsText } from './jsonc-settings-text.ts'

const text = createJsoncSettingsText()
const BOM = String.fromCharCode(0xfeff)

describe('createJsoncSettingsText read', () => {
  it('should read the values when the file has comments and trailing commas', () => {
    const source =
      '{\n  // mine\n  "theme": "light", /* why */\n  "window": { "heightRatio": 0.6, },\n}\n'

    const read = text.read(source)

    expect(read).toEqual({ kind: 'ok', value: { theme: 'light', window: { heightRatio: 0.6 } } })
  })

  it('should read an empty object when the file holds only blanks and comments', () => {
    expect(text.read('  // nothing yet\n')).toEqual({ kind: 'ok', value: {} })
  })

  it('should tell the line and column of the first error when the text is not valid', () => {
    const source = '{\n  "theme": "light"\n  "opacity": 0.8\n}\n'

    const read = text.read(source)

    expect(read).toEqual({ kind: 'invalid', at: { line: 3, column: 3 } })
  })

  it('should say the file is invalid when it holds something other than an object', () => {
    expect(text.read('\n  [1, 2]')).toEqual({ kind: 'invalid', at: { line: 2, column: 3 } })
  })

  it('should read the values when the file starts with a byte order mark', () => {
    expect(text.read(`${BOM}{ "theme": "light" }`)).toEqual({
      kind: 'ok',
      value: { theme: 'light' },
    })
  })
})

describe('createJsoncSettingsText edit', () => {
  it('should change only the edited value when the file has comments elsewhere', () => {
    const source = '{\n  // my theme\n  "theme": "dark", // dark at night\n  "fontSize": 14\n}\n'

    const edited = text.edit(source, [{ path: ['fontSize'], value: 18 }])

    expect(edited).toBe(
      '{\n  // my theme\n  "theme": "dark", // dark at night\n  "fontSize": 18\n}\n',
    )
  })

  it('should add a missing group with the file indentation when the key is new', () => {
    const source = '{\n    "theme": "dark"\n}\n'

    const edited = text.edit(source, [{ path: ['window', 'heightRatio'], value: 0.6 }])

    expect(edited).toBe(
      '{\n    "theme": "dark",\n    "window": {\n        "heightRatio": 0.6\n    }\n}\n',
    )
  })

  it('should leave the comment beside the last value on its line when a key is added after it', () => {
    const source = '{\n  "theme": "light" // by day\n}\n'

    const edited = text.edit(source, [{ path: ['fontSize'], value: 18 }])

    expect(edited).toBe('{\n  "theme": "light", // by day\n  "fontSize": 18\n}\n')
  })

  it('should keep the trailing comma style when a key is added after a value that has one', () => {
    const source = '{\n  "theme": "light", /* by day */\n}\n'

    const edited = text.edit(source, [{ path: ['system', 'notifyAfterSeconds'], value: 60 }])

    expect(edited).toBe(
      '{\n  "theme": "light", /* by day */\n  "system": {\n    "notifyAfterSeconds": 60\n  },\n}\n',
    )
  })

  it('should add a key on its own line with the file line ends when the file uses CRLF', () => {
    const edited = text.edit('{\r\n  "theme": "light"\r\n}\r\n', [
      { path: ['fontSize'], value: 18 },
    ])

    expect(edited).toBe('{\r\n  "theme": "light",\r\n  "fontSize": 18\r\n}\r\n')
  })

  it('should remove the key when the edited value is undefined', () => {
    const source = '{\n  "review": { "bases": { "/home/ana/acme.backend": "origin/dev" } }\n}\n'

    const edited = text.edit(source, [
      { path: ['review', 'bases', '/home/ana/acme.backend'], value: undefined },
    ])

    expect(text.read(edited)).toEqual({ kind: 'ok', value: { review: { bases: {} } } })
  })

  it('should keep the byte order mark when the file starts with one', () => {
    const edited = text.edit(`${BOM}{ "theme": "dark" }`, [{ path: ['theme'], value: 'light' }])

    expect(edited).toBe(`${BOM}{ "theme": "light" }`)
  })
})

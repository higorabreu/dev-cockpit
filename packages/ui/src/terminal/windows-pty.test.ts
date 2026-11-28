import { describe, expect, it } from 'vitest'
import { windowsPtyFor } from './windows-pty.ts'

describe('windowsPtyFor', () => {
  it('should tell xterm it runs on ConPTY with the build number when the system is Windows', () => {
    expect(windowsPtyFor('win32', '10.0.26200')).toEqual({ backend: 'conpty', buildNumber: 26200 })
  })

  it('should still name ConPTY when the Windows version has no build number', () => {
    expect(windowsPtyFor('win32', '10.0')).toEqual({ backend: 'conpty' })
  })

  it('should leave xterm as it is when the system is Linux or macOS', () => {
    expect(windowsPtyFor('linux', '6.8.0')).toBeUndefined()
    expect(windowsPtyFor('darwin', '15.1.0')).toBeUndefined()
  })
})

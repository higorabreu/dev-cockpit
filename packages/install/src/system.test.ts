import { describe, expect, it } from 'vitest'
import { pickSystem } from './system.ts'

describe('pickSystem', () => {
  it('should install the .deb when Linux has apt on a processor the release builds for', () => {
    expect(pickSystem('linux', 'x64', true)).toEqual({ kind: 'debian' })
    expect(pickSystem('linux', 'arm64', true)).toEqual({ kind: 'debian' })
  })

  it('should not install when Linux has no apt', () => {
    expect(pickSystem('linux', 'x64', false).kind).toBe('unsupported')
  })

  it('should not install when the Linux processor has no package', () => {
    expect(pickSystem('linux', 'ia32', true)).toEqual({
      kind: 'unsupported',
      system: 'Linux on ia32',
    })
  })

  it('should install the image when the Mac is Apple Silicon', () => {
    expect(pickSystem('darwin', 'arm64', false)).toEqual({ kind: 'mac' })
  })

  it('should not install when the Mac is Intel', () => {
    expect(pickSystem('darwin', 'x64', false)).toEqual({ kind: 'unsupported', system: 'Intel Mac' })
  })

  it('should install the zip when the system is Windows on x64 or on ARM', () => {
    expect(pickSystem('win32', 'x64', false)).toEqual({ kind: 'windows' })
    expect(pickSystem('win32', 'arm64', false)).toEqual({ kind: 'windows' })
  })

  it('should not install when Windows runs on a 32-bit processor', () => {
    expect(pickSystem('win32', 'ia32', false)).toEqual({
      kind: 'unsupported',
      system: 'Windows on ia32',
    })
  })
})

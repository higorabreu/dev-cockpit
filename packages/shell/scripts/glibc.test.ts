import { describe, expect, it } from 'vitest'
import { compareVersions, newestGlibc } from './glibc.mjs'

const elf = (...names: string[]) => Buffer.from(`\x7fELF\0${names.join('\0')}\0`, 'latin1')

describe('newestGlibc', () => {
  it('should give the newest version when the module names several', () => {
    // Arrange
    const module = elf('GLIBC_2.2.5', 'GLIBC_2.34', 'GLIBC_2.4', 'GLIBC_PRIVATE')

    // Act
    const newest = newestGlibc(module)

    // Assert
    expect(newest).toBe('2.34')
  })

  it('should give nothing when the module names no glibc version', () => {
    expect(newestGlibc(elf('libc.so.6'))).toBeUndefined()
  })
})

describe('compareVersions', () => {
  it('should order versions by number when a part has more digits', () => {
    expect(compareVersions('2.42', '2.35')).toBeGreaterThan(0)
    expect(compareVersions('2.4', '2.35')).toBeLessThan(0)
    expect(compareVersions('2.2.5', '2.2')).toBeGreaterThan(0)
    expect(compareVersions('2.35', '2.35')).toBe(0)
  })
})

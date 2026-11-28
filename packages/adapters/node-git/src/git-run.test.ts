import { describe, expect, it } from 'vitest'
import { systemPath } from './git-run.ts'

describe('systemPath', () => {
  it('should drop the line break git prints after a path when reading its answer', () => {
    // Act
    const path = systemPath('/home/ana/acme\n')

    // Assert
    expect(path).toMatch(/[/\\]home[/\\]ana[/\\]acme$/)
  })

  it('should give nothing when git answered nothing', () => {
    // Act
    const path = systemPath('\n')

    // Assert
    expect(path).toBe('')
  })

  it.runIf(process.platform === 'win32')(
    'should use backslashes when Git for Windows prints a path with forward slashes',
    () => {
      // Act
      const path = systemPath('C:/Users/ana/acme\n')

      // Assert
      expect(path).toBe('C:\\Users\\ana\\acme')
    },
  )
})

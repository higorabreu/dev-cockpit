import { describe, expect, it } from 'vitest'
import { parseArgs } from './args.ts'

describe('parseArgs', () => {
  it('should install the latest release when no option is given', () => {
    expect(parseArgs([])).toEqual({ kind: 'install', downloadOnly: false })
  })

  it('should install the named release when a version is given in either form', () => {
    expect(parseArgs(['--version', '0.9.0'])).toEqual({
      kind: 'install',
      version: '0.9.0',
      downloadOnly: false,
    })
    expect(parseArgs(['--version=v0.10.0', '--download-only'])).toEqual({
      kind: 'install',
      version: '0.10.0',
      downloadOnly: true,
    })
  })

  it('should show the help when asked', () => {
    expect(parseArgs(['--download-only', '-h'])).toEqual({ kind: 'help' })
    expect(parseArgs(['--help'])).toEqual({ kind: 'help' })
  })

  it('should explain the usage when the version is missing, a prerelease or not a version', () => {
    expect(parseArgs(['--version'])).toEqual({
      kind: 'usage',
      problem: 'not a release version: ',
    })
    expect(parseArgs(['--version', '1.0.0-beta.1']).kind).toBe('usage')
    expect(parseArgs(['--version', 'latest']).kind).toBe('usage')
  })

  it('should explain the usage when an option is unknown', () => {
    expect(parseArgs(['--yes'])).toEqual({ kind: 'usage', problem: 'unknown option: --yes' })
  })
})

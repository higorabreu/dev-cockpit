import { describe, expect, it } from 'vitest'
import type { Release } from '../ports/updates.ts'
import { debPackageName, parseChecksums, releaseFiles } from './release-files.ts'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'B'.repeat(64)
const base = 'https://downloads.example.com/v0.10.0'
const asset = (name: string) => ({ name, url: `${base}/${name}`, size: 10 })
const release = (names: readonly string[]): Release => ({
  version: '0.10.0',
  page: 'https://github.example.com/acme/backend/releases/tag/v0.10.0',
  assets: names.map(asset),
})

describe('debPackageName', () => {
  it('should name the amd64 package when the processor is x64', () => {
    expect(debPackageName('0.10.0', 'x64')).toBe('dev-cockpit_0.10.0_amd64.deb')
  })

  it('should name the arm64 package when the processor is arm64', () => {
    expect(debPackageName('0.10.0', 'arm64')).toBe('dev-cockpit_0.10.0_arm64.deb')
  })

  it('should name nothing when the release has no package for the processor', () => {
    expect(debPackageName('0.10.0', 'ia32')).toBeUndefined()
  })
})

describe('parseChecksums', () => {
  it('should read each file and its hash when the lines come from sha256sum', () => {
    const sums = parseChecksums(
      `${HASH_A}  dev-cockpit_0.10.0_amd64.deb\n${HASH_B} *dev-cockpit_0.10.0_arm64.dmg\n`,
    )

    expect(sums.get('dev-cockpit_0.10.0_amd64.deb')).toBe(HASH_A)
    expect(sums.get('dev-cockpit_0.10.0_arm64.dmg')).toBe('b'.repeat(64))
  })

  it('should skip a line when it is not a hash and a name', () => {
    const sums = parseChecksums(`# comment\n${'c'.repeat(63)}  short.deb\n\n${HASH_A}  ok.deb\r\n`)

    expect([...sums.keys()]).toEqual(['ok.deb'])
  })
})

describe('releaseFiles', () => {
  it('should pick the package for the processor and the checksums when both are attached', () => {
    const files = releaseFiles(
      release(['dev-cockpit_0.10.0_arm64.deb', 'dev-cockpit_0.10.0_amd64.deb', 'SHA256SUMS']),
      'x64',
    )

    expect(files?.package.name).toBe('dev-cockpit_0.10.0_amd64.deb')
    expect(files?.checksums.name).toBe('SHA256SUMS')
  })

  it('should pick nothing when the checksums are missing', () => {
    expect(releaseFiles(release(['dev-cockpit_0.10.0_amd64.deb']), 'x64')).toBeUndefined()
  })

  it('should pick nothing when the package for the processor is missing', () => {
    expect(releaseFiles(release(['dev-cockpit_0.10.0_amd64.deb', 'SHA256SUMS']), 'arm64')).toBe(
      undefined,
    )
  })
})

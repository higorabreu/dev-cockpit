import { describe, expect, it } from 'vitest'
import type { Release } from '../ports/updates.ts'
import {
  debPackageName,
  macImageName,
  parseChecksums,
  releaseFiles,
  windowsZipName,
} from './release-files.ts'

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

describe('macImageName', () => {
  it('should name the arm64 image when the processor is Apple Silicon', () => {
    expect(macImageName('0.10.0', 'arm64')).toBe('dev-cockpit_0.10.0_arm64.dmg')
  })

  it('should name nothing when the processor is Intel', () => {
    expect(macImageName('0.10.0', 'x64')).toBeUndefined()
  })
})

describe('windowsZipName', () => {
  it('should name the x64 zip when the processor is x64', () => {
    expect(windowsZipName('0.10.0', 'x64')).toBe('dev-cockpit_0.10.0_win32-x64.zip')
  })

  it('should name nothing when the processor is ARM, which runs the x64 build', () => {
    expect(windowsZipName('0.10.0', 'arm64')).toBeUndefined()
  })
})

describe('releaseFiles', () => {
  const AMD64 = 'dev-cockpit_0.10.0_amd64.deb'

  it('should pick the named package and the checksums when both are attached', () => {
    const files = releaseFiles(
      release(['dev-cockpit_0.10.0_arm64.deb', AMD64, 'SHA256SUMS']),
      debPackageName('0.10.0', 'x64'),
    )

    expect(files?.package.name).toBe(AMD64)
    expect(files?.checksums.name).toBe('SHA256SUMS')
  })

  it('should pick nothing when the checksums are missing', () => {
    expect(releaseFiles(release([AMD64]), AMD64)).toBeUndefined()
  })

  it('should pick nothing when the named package is missing', () => {
    const files = release([AMD64, 'SHA256SUMS'])

    expect(releaseFiles(files, macImageName('0.10.0', 'arm64'))).toBeUndefined()
  })

  it('should pick nothing when there is no package for the system', () => {
    expect(releaseFiles(release(['SHA256SUMS']), undefined)).toBeUndefined()
  })
})

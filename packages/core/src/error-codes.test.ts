import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import errorCodes from '../error-codes.json' with { type: 'json' }

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (name === 'node_modules' || name === 'dist') return []
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

const used = new Set(
  sourceFiles(join(import.meta.dirname, '..', '..')).flatMap(
    (file) => readFileSync(file, 'utf8').match(/DCK-[A-Z]+-\d{3}/g) ?? [],
  ),
)

const categories = [
  'invalid_argument',
  'not_found',
  'already_exists',
  'permission_denied',
  'unavailable',
  'internal',
]
const entries = Object.entries(errorCodes)

describe('error code registry', () => {
  it('should register every code used in the source when scanning all packages', () => {
    const unregistered = [...used].filter((code) => !(code in errorCodes))

    expect(unregistered).toEqual([])
  })

  it('should have no registered code that the source does not use when scanning all packages', () => {
    const unused = Object.keys(errorCodes).filter((code) => !used.has(code))

    expect(unused).toEqual([])
  })

  it('should follow the DCK-DOMAIN-SEQ format when listing the codes', () => {
    const malformed = entries
      .map(([code]) => code)
      .filter((code) => !/^DCK-[A-Z]+-\d{3}$/.test(code))

    expect(malformed).toEqual([])
  })

  it('should give every code a known category and a retryable flag when listing the codes', () => {
    const invalid = entries
      .filter(
        ([, info]) => !categories.includes(info.category) || typeof info.retryable !== 'boolean',
      )
      .map(([code]) => code)

    expect(invalid).toEqual([])
  })

  it('should keep every RPC code in a valid JSON-RPC range and unique when listing the codes', () => {
    const rpc = entries.map(([, info]) => info.rpc)
    const standard = (code: number) => code >= -32700 && code <= -32600
    const application = (code: number) => code >= -32099 && code <= -32000

    expect(rpc.filter((code) => !standard(code) && !application(code))).toEqual([])
    expect(new Set(rpc).size).toBe(rpc.length)
  })
})

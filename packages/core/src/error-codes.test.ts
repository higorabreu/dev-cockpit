import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import errorCodes from '../error-codes.json' with { type: 'json' }

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

const used = new Set(
  sourceFiles(join(import.meta.dirname)).flatMap(
    (file) => readFileSync(file, 'utf8').match(/DCK-[A-Z]+-\d{3}/g) ?? [],
  ),
)

describe('error code registry', () => {
  it('should register every code used in the source when scanning the package', () => {
    const unregistered = [...used].filter((code) => !(code in errorCodes))

    expect(unregistered).toEqual([])
  })

  it('should have no registered code that the source does not use when scanning the package', () => {
    const unused = Object.keys(errorCodes).filter((code) => !used.has(code))

    expect(unused).toEqual([])
  })
})

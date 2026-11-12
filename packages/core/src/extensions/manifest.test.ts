import { describe, expect, it } from 'vitest'
import { EXTENSION_ID_MAX, parseManifest } from './manifest.ts'

const valid = {
  id: 'acme.conventional-commits',
  name: 'Conventional commits',
  version: '1.0.0',
  apiVersion: 1,
  engines: { dck: '>=0.3.0' },
  contributes: { rules: 'rules/' },
}

const failureOf = (input: unknown) => {
  const result = parseManifest(input)
  return result.ok ? undefined : result.error
}

describe('parseManifest', () => {
  it('should return the manifest when every field is valid', () => {
    const result = parseManifest(valid)

    expect(result).toEqual({ ok: true, value: valid })
  })

  it('should default the contributions to none when the manifest declares nothing', () => {
    const { contributes: _omitted, ...bare } = valid

    const result = parseManifest(bare)

    expect(result.ok && result.value.contributes).toEqual({})
  })

  it.each([
    ['not an object', 'text'],
    ['an array', []],
    ['null', null],
  ])('should fail with DCK-EXT-001 when the manifest is %s', (_name, input) => {
    expect(failureOf(input)?.data?.code).toBe('DCK-EXT-001')
  })

  it.each([
    ['an id without an owner', { ...valid, id: 'conventional' }],
    ['an uppercase id', { ...valid, id: 'Acme.Commits' }],
    ['a version that is not three numbers', { ...valid, version: '1.0' }],
    ['an api version that is not a positive integer', { ...valid, apiVersion: 0 }],
    ['an engines range that is not supported', { ...valid, engines: { dck: '^0.3.0' } }],
    ['an unknown top level field', { ...valid, homepage: 'https://example.com' }],
    ['a contribution point name in uppercase', { ...valid, contributes: { Rules: 'x' } }],
  ])('should fail with DCK-EXT-001 when the manifest has %s', (_name, input) => {
    expect(failureOf(input)?.data?.code).toBe('DCK-EXT-001')
  })

  it('should fail with DCK-EXT-001 when the id is longer than the limit', () => {
    const error = failureOf({ ...valid, id: `acme.${'x'.repeat(EXTENSION_ID_MAX)}` })

    expect(error?.data?.code).toBe('DCK-EXT-001')
  })

  it('should name the failing field when the manifest is invalid', () => {
    const error = failureOf({ ...valid, id: 'conventional' })

    expect(error?.message).toContain('id')
  })

  it.each(['run', 'main', 'permissions', 'activationEvents'])(
    'should fail with DCK-EXT-002 when the manifest declares %s',
    (field) => {
      const error = failureOf({ ...valid, [field]: 'anything' })

      expect(error?.data?.code).toBe('DCK-EXT-002')
      expect(error?.message).toContain(field)
    },
  )
})

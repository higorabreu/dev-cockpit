import { describe, expect, it } from 'vitest'
import { normalizeBaseUrl, parseServerUrl } from './url.ts'

describe('normalizeBaseUrl', () => {
  it('should drop the trailing slash and the api path when normalizing', () => {
    expect(normalizeBaseUrl(' https://gl.test/api/v4/ ')).toBe('https://gl.test')
    expect(normalizeBaseUrl('https://gl.test/gitlab/')).toBe('https://gl.test/gitlab')
  })
})

describe('parseServerUrl', () => {
  it('should return the normalized address when it is https', () => {
    expect(parseServerUrl('https://gitlab.empresa.com/')).toBe('https://gitlab.empresa.com')
  })

  it('should accept plain http when the host is the own machine', () => {
    expect(parseServerUrl('http://localhost:8080')).toBe('http://localhost:8080')
  })

  it.each([
    ['plain http to a remote host', 'http://gitlab.empresa.com'],
    ['not an address', 'gitlab'],
    ['credentials in the address', 'https://user:pass@gitlab.empresa.com'],
    ['a query string', 'https://gitlab.empresa.com?x=1'],
    ['another protocol', 'ftp://gitlab.empresa.com'],
    ['an empty text', ''],
  ])('should reject the address when it has %s', (_label, input) => {
    expect(parseServerUrl(input)).toBeUndefined()
  })
})

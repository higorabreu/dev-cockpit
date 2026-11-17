import { describe, expect, it } from 'vitest'
import { connectorSchema } from './connector.ts'
import { GITHUB_CONNECTOR, parseGitHubUrl } from './github.ts'

describe('GITHUB_CONNECTOR', () => {
  it('should be a valid declaration with two merge request views when read', () => {
    const parsed = connectorSchema.parse(GITHUB_CONNECTOR)

    expect(parsed.connection.email).toBeUndefined()
    expect(parsed.ciTerm).toBe('checks')
    expect(parsed.views.map((view) => [view.id, view.kind, view.badge])).toEqual([
      ['github-review', 'mergeRequest', 'views.github.waiting'],
      ['github-mine', 'mergeRequest', undefined],
    ])
  })
})

describe('parseGitHubUrl', () => {
  it.each([
    ['', 'https://github.com'],
    ['   ', 'https://github.com'],
    ['https://github.com', 'https://github.com'],
    ['https://github.com/acme/backend/pull/12', 'https://github.com'],
    ['https://api.github.com', 'https://github.com'],
    ['https://github.example.com/', 'https://github.example.com'],
    ['https://github.example.com/api/v3', 'https://github.example.com'],
    ['https://github.example.com/acme/backend?tab=readme', 'https://github.example.com'],
    ['http://127.0.0.1:8099', 'http://127.0.0.1:8099'],
  ])('should give the web root when the address is %j', (input, expected) => {
    expect(parseGitHubUrl(input)).toBe(expected)
  })

  it.each([
    ['plain http to another machine', 'http://github.example.com'],
    ['no scheme', 'github.example.com'],
    ['a user and password', 'https://ana:secret@github.example.com'],
    ['another protocol', 'ftp://github.example.com'],
  ])('should refuse the address when it has %s', (_label, input) => {
    expect(parseGitHubUrl(input)).toBeUndefined()
  })
})

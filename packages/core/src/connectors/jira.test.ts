import { describe, expect, it } from 'vitest'
import { connectorSchema } from './connector.ts'
import { JIRA_CONNECTOR, parseAccountEmail, parseJiraSiteUrl } from './jira.ts'

describe('JIRA_CONNECTOR', () => {
  it('should be a valid declaration with the e-mail field and one issue view when read', () => {
    const parsed = connectorSchema.parse(JIRA_CONNECTOR)

    expect(parsed.connection.email).toEqual({ placeholder: 'ana@example.com' })
    expect(parsed.views).toEqual([
      { id: 'tasks', kind: 'issue', title: 'views.tasks', empty: 'views.empty.tasks' },
    ])
  })
})

describe('parseJiraSiteUrl', () => {
  it.each([
    ['https://acme.atlassian.net', 'https://acme.atlassian.net'],
    [' https://acme.atlassian.net/ ', 'https://acme.atlassian.net'],
    ['https://acme.atlassian.net/browse/ACME-1', 'https://acme.atlassian.net'],
    [
      'https://acme.atlassian.net/jira/software/projects/ACME/boards/1?selectedIssue=ACME-2',
      'https://acme.atlassian.net',
    ],
    ['http://localhost:8080/rest/api/3', 'http://localhost:8080'],
  ])('should keep only the site root when the address is %s', (input, expected) => {
    expect(parseJiraSiteUrl(input)).toBe(expected)
  })

  it.each([
    ['plain http to another machine', 'http://acme.atlassian.net'],
    ['no scheme', 'acme.atlassian.net'],
    ['a user and password', 'https://ana:secret@acme.atlassian.net'],
    ['nothing', ''],
  ])('should refuse the address when it has %s', (_label, input) => {
    expect(parseJiraSiteUrl(input)).toBeUndefined()
  })
})

describe('parseAccountEmail', () => {
  it('should trim the e-mail when it is an address', () => {
    expect(parseAccountEmail(' ana@example.com ')).toBe('ana@example.com')
  })

  it.each(['', 'ana', 'ana@', '@example.com'])(
    'should refuse %j when it is not an address',
    (input) => {
      expect(parseAccountEmail(input)).toBeUndefined()
    },
  )
})

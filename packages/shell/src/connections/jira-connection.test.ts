import {
  type ConnectionFields,
  errorBody,
  fail,
  type IssueTrackerSource,
  type Logger,
  ok,
  silentLogger,
} from '@dck/core'
import { MemorySecretStore } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { createJiraConnection, type JiraAccount } from './jira-connection.ts'

const user = { id: '5b10a2844c20165700ede21g', name: 'Ana Souza' }
const site = 'https://acme.atlassian.net'

function setup(
  options: { valid?: boolean; stored?: ConnectionFields | null; logger?: Logger } = {},
) {
  const secrets = new MemorySecretStore()
  let stored: ConnectionFields | null = options.stored ?? null
  const saved: unknown[] = []
  const seen: { account: JiraAccount; token: string }[] = []
  const connection = createJiraConnection({
    secrets,
    tokenKey: 'jira.token',
    logger: options.logger ?? silentLogger,
    account: {
      get: () => stored,
      set: async (fields) => {
        saved.push(fields)
        stored = fields
      },
    },
    createSource: (account, token): IssueTrackerSource => {
      seen.push({ account, token })
      return {
        currentUser: async () =>
          options.valid === false ? fail(errorBody('DCK-JRA-001', 'HTTP 401')) : ok(user),
        assignedIssues: async () => ok([]),
      }
    },
  })
  return { connection, secrets, seen, saved, stored: () => stored }
}

describe('connect', () => {
  it('should keep the token in the keyring and the address and e-mail in the settings when Jira accepts them', async () => {
    const { connection, secrets, stored, seen } = setup()

    const status = await connection.connect(
      { url: `${site}/`, email: ' ana@example.com ' },
      'atlassian-token',
    )

    expect(status).toEqual({
      kind: 'connected',
      url: site,
      user: { username: 'Ana Souza', name: 'Ana Souza' },
    })
    expect(seen).toEqual([
      { account: { url: site, email: 'ana@example.com' }, token: 'atlassian-token' },
    ])
    expect(await secrets.get('jira.token')).toEqual({ ok: true, value: 'atlassian-token' })
    expect(stored()).toEqual({ url: site, email: 'ana@example.com' })
  })

  it('should connect to the site root when a board link is pasted as the address', async () => {
    const { connection, stored } = setup()

    await connection.connect(
      {
        url: `${site}/jira/software/projects/ACME/boards/1?selectedIssue=ACME-1`,
        email: 'ana@example.com',
      },
      'atlassian-token',
    )

    expect(stored()?.url).toBe(site)
  })

  it('should keep nothing when Jira refuses the credentials', async () => {
    const { connection, secrets, stored } = setup({ valid: false })

    const status = await connection.connect({ url: site, email: 'ana@example.com' }, 'wrong')

    expect(status).toEqual({ kind: 'error', url: site, code: 'DCK-JRA-001' })
    expect(await secrets.get('jira.token')).toEqual({ ok: true, value: undefined })
    expect(stored()).toBeNull()
  })

  it.each([
    ['plain http to another machine', 'http://acme.atlassian.net'],
    ['no scheme', 'acme.atlassian.net'],
    ['a user in the address', 'https://ana:pw@acme.atlassian.net'],
  ])('should refuse the address without calling Jira when it has %s', async (_label, url) => {
    const { connection, seen } = setup()

    const status = await connection.connect({ url, email: 'ana@example.com' }, 'atlassian-token')

    expect(status).toEqual({ kind: 'error', url: undefined, code: 'DCK-JRA-007' })
    expect(seen).toEqual([])
  })

  it.each([
    ['empty', ''],
    ['missing', undefined],
    ['not an address', 'ana'],
  ])('should refuse the e-mail without calling Jira when it is %s', async (_label, email) => {
    const { connection, seen } = setup()

    const status = await connection.connect({ url: site, email }, 'atlassian-token')

    expect(status).toEqual({ kind: 'error', url: undefined, code: 'DCK-JRA-008' })
    expect(seen).toEqual([])
  })

  it('should accept plain http on the local machine when connecting', async () => {
    const { connection } = setup()

    const status = await connection.connect(
      { url: 'http://localhost:8080', email: 'ana@example.com' },
      'atlassian-token',
    )

    expect(status.kind).toBe('connected')
  })
})

describe('status', () => {
  it('should be none when there is no address', async () => {
    const { connection } = setup()

    expect(await connection.status()).toEqual({ kind: 'none' })
  })

  it('should be none when the address has no e-mail', async () => {
    const { connection, secrets } = setup({ stored: { url: site } })
    await secrets.set('jira.token', 'atlassian-token')

    expect(await connection.status()).toEqual({ kind: 'none' })
  })

  it('should be none when the account has no token stored', async () => {
    const { connection } = setup({ stored: { url: site, email: 'ana@example.com' } })

    expect(await connection.status()).toEqual({ kind: 'none' })
  })

  it('should check the stored account with the token from the keyring when both exist', async () => {
    const { connection, secrets, seen } = setup({
      stored: { url: site, email: 'ana@example.com' },
    })
    await secrets.set('jira.token', 'atlassian-token')

    const status = await connection.status()

    expect(status.kind).toBe('connected')
    expect(seen).toEqual([
      { account: { url: site, email: 'ana@example.com' }, token: 'atlassian-token' },
    ])
  })

  it('should report the error when the stored token stopped working', async () => {
    const { connection, secrets } = setup({
      stored: { url: site, email: 'ana@example.com' },
      valid: false,
    })
    await secrets.set('jira.token', 'atlassian-token')

    expect(await connection.status()).toEqual({ kind: 'error', url: site, code: 'DCK-JRA-001' })
  })
})

describe('disconnect', () => {
  it('should remove the token and erase the address and the e-mail when disconnecting', async () => {
    const { connection, secrets, stored, saved } = setup()
    await connection.connect({ url: site, email: 'ana@example.com' }, 'atlassian-token')

    const status = await connection.disconnect()

    expect(status).toEqual({ kind: 'none' })
    expect(await secrets.get('jira.token')).toEqual({ ok: true, value: undefined })
    expect(stored()).toBeNull()
    expect(saved.at(-1)).toBeNull()
  })
})

describe('where the token and the e-mail go', () => {
  it('should keep the token out of the logs and the settings and the e-mail out of the logs when connecting', async () => {
    const logged: unknown[] = []
    const logger: Logger = {
      info: (message, context) => void logged.push(message, context),
      warn: (message, context) => void logged.push(message, context),
      error: (message, context) => void logged.push(message, context),
    }
    const good = setup({ logger })
    const bad = setup({ logger, valid: false })

    await good.connection.connect({ url: site, email: 'ana@example.com' }, 'atlassian-secret')
    await bad.connection.connect({ url: site, email: 'ana@example.com' }, 'atlassian-secret')
    await good.connection.connect({ url: site, email: 'not-an-email' }, 'atlassian-secret')

    expect(logged.length).toBeGreaterThan(0)
    expect(JSON.stringify(logged)).not.toContain('ana@example.com')
    expect(JSON.stringify(logged)).not.toContain('not-an-email')
    expect(JSON.stringify([logged, good.saved, bad.saved])).not.toContain('atlassian-secret')
  })
})

import { type CodeReviewSource, errorBody, fail, ok, silentLogger } from '@dck/core'
import { MemorySecretStore } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { createGitLabConnection } from './gitlab-connection.ts'

const user = { id: '7', username: 'higor', name: 'Higor' }

function setup(options: { valid?: boolean; url?: string | null } = {}) {
  const secrets = new MemorySecretStore()
  let url: string | null = options.url ?? null
  const seen: { url: string; token: string }[] = []
  const connection = createGitLabConnection({
    secrets,
    tokenKey: 'gitlab.token',
    logger: silentLogger,
    address: {
      get: () => url,
      set: async (value) => {
        url = value
      },
    },
    createSource: (sourceUrl, token): CodeReviewSource => {
      seen.push({ url: sourceUrl, token })
      return {
        currentUser: async () =>
          options.valid === false ? fail(errorBody('DCK-GLB-001', 'HTTP 401')) : ok(user),
        mergeRequests: async () => ok([]),
      }
    },
  })
  return { connection, secrets, seen, address: () => url }
}

describe('connect', () => {
  it('should store the token and the address when the token is valid', async () => {
    const { connection, secrets, address } = setup()

    const status = await connection.connect({ url: 'https://gl.test/' }, 'glpat-x')

    expect(status).toEqual({
      kind: 'connected',
      url: 'https://gl.test',
      user: { username: 'higor', name: 'Higor' },
    })
    expect(await secrets.get('gitlab.token')).toEqual({ ok: true, value: 'glpat-x' })
    expect(address()).toBe('https://gl.test')
  })

  it('should keep nothing when the token is refused', async () => {
    const { connection, secrets, address } = setup({ valid: false })

    const status = await connection.connect({ url: 'https://gl.test' }, 'glpat-x')

    expect(status).toEqual({ kind: 'error', url: 'https://gl.test', code: 'DCK-GLB-001' })
    expect(await secrets.get('gitlab.token')).toEqual({ ok: true, value: undefined })
    expect(address()).toBeNull()
  })

  it('should refuse the address without calling GitLab when it is not secure', async () => {
    const { connection, seen } = setup()

    const status = await connection.connect({ url: 'http://gl.test' }, 'glpat-x')

    expect(status).toEqual({ kind: 'error', url: undefined, code: 'DCK-GLB-007' })
    expect(seen).toEqual([])
  })
})

describe('status', () => {
  it('should be none when there is no address', async () => {
    const { connection } = setup()

    expect(await connection.status()).toEqual({ kind: 'none' })
  })

  it('should be none when the address has no token stored', async () => {
    const { connection } = setup({ url: 'https://gl.test' })

    expect(await connection.status()).toEqual({ kind: 'none' })
  })

  it('should check the stored token when both exist', async () => {
    const { connection, secrets, seen } = setup({ url: 'https://gl.test' })
    await secrets.set('gitlab.token', 'glpat-x')

    const status = await connection.status()

    expect(status.kind).toBe('connected')
    expect(seen).toEqual([{ url: 'https://gl.test', token: 'glpat-x' }])
  })

  it('should report the error when the stored token stopped working', async () => {
    const { connection, secrets } = setup({ url: 'https://gl.test', valid: false })
    await secrets.set('gitlab.token', 'glpat-x')

    expect(await connection.status()).toEqual({
      kind: 'error',
      url: 'https://gl.test',
      code: 'DCK-GLB-001',
    })
  })
})

describe('disconnect', () => {
  it('should remove the token and the address when disconnecting', async () => {
    const { connection, secrets, address } = setup()
    await connection.connect({ url: 'https://gl.test' }, 'glpat-x')

    const status = await connection.disconnect()

    expect(status).toEqual({ kind: 'none' })
    expect(await secrets.get('gitlab.token')).toEqual({ ok: true, value: undefined })
    expect(address()).toBeNull()
  })
})

describe('profiles sharing one vault', () => {
  it('should not remove the token of another profile when disconnecting', async () => {
    const secrets = new MemorySecretStore()
    const make = (tokenKey: string) =>
      createGitLabConnection({
        secrets,
        tokenKey,
        logger: silentLogger,
        address: { get: () => null, set: async () => undefined },
        createSource: () => ({
          currentUser: async () => ok(user),
          mergeRequests: async () => ok([]),
        }),
      })
    await secrets.set('gitlab.token', 'token-do-app-instalado')

    await make('dev:gitlab.token').disconnect()

    expect(await secrets.get('gitlab.token')).toEqual({ ok: true, value: 'token-do-app-instalado' })
  })
})

describe('where the token goes', () => {
  it('should keep the token out of the logs and the settings when connecting succeeds or fails', async () => {
    const logged: unknown[] = []
    const saved: unknown[] = []
    const make = (valid: boolean) =>
      createGitLabConnection({
        secrets: new MemorySecretStore(),
        tokenKey: 'gitlab.token',
        logger: {
          info: (message, context) => void logged.push(message, context),
          warn: (message, context) => void logged.push(message, context),
          error: (message, context) => void logged.push(message, context),
        },
        address: { get: () => null, set: async (url) => void saved.push(url) },
        createSource: () => ({
          currentUser: async () => (valid ? ok(user) : fail(errorBody('DCK-GLB-001', 'HTTP 401'))),
          mergeRequests: async () => ok([]),
        }),
      })

    await make(true).connect({ url: 'https://gl.test' }, 'glpat-secret-value')
    await make(false).connect({ url: 'https://gl.test' }, 'glpat-secret-value')

    expect(logged.length).toBeGreaterThan(0)
    expect(JSON.stringify([logged, saved])).not.toContain('glpat-secret-value')
  })
})

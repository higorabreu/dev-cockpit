import { randomUUID } from 'node:crypto'
import type { Result } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { type CredentialEntry, createCredentialStore, type OpenEntry } from './credential-store.ts'

const codeOf = (result: Result<unknown, { data?: { code?: string } }>) =>
  result.ok ? undefined : result.error.data?.code

// An in-memory Credential Manager that records which entries were opened
function fakeManager(failing?: Error) {
  const saved = new Map<string, string>()
  const opened: string[] = []
  const open: OpenEntry = async (service, key) => {
    const name = `${service}/${key}`
    opened.push(name)
    const entry: CredentialEntry = {
      async getPassword() {
        if (failing) throw failing
        return saved.get(name) ?? null
      },
      async setPassword(password) {
        if (failing) throw failing
        saved.set(name, password)
      },
      async deletePassword() {
        if (failing) throw failing
        return saved.delete(name)
      },
    }
    return entry
  }
  return { open, saved, opened }
}

describe('createCredentialStore', () => {
  it('should give back the secret stored under the key when it was saved before', async () => {
    const { open } = fakeManager()
    const store = createCredentialStore({ open })
    await store.set('gitlab.token', 'glpat-123')

    const result = await store.get('gitlab.token')

    expect(result).toEqual({ ok: true, value: 'glpat-123' })
  })

  it('should keep the secrets under the dev-cockpit service when storing', async () => {
    const { open, opened } = fakeManager()

    await createCredentialStore({ open }).set('gitlab.token', 'glpat-123')

    expect(opened).toEqual(['dev-cockpit/gitlab.token'])
  })

  it('should return undefined when the credential does not exist', async () => {
    const { open } = fakeManager()

    const result = await createCredentialStore({ open }).get('gitlab.token')

    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('should succeed when deleting a credential that does not exist', async () => {
    const { open } = fakeManager()

    const result = await createCredentialStore({ open }).delete('gitlab.token')

    expect(result.ok).toBe(true)
  })

  it('should remove the secret when deleting a stored credential', async () => {
    const { open, saved } = fakeManager()
    const store = createCredentialStore({ open })
    await store.set('gitlab.token', 'glpat-123')

    await store.delete('gitlab.token')

    expect(saved.size).toBe(0)
  })

  it('should report the store unavailable when the native module cannot be loaded', async () => {
    const store = createCredentialStore({ open: async () => undefined })

    const results = [await store.get('k'), await store.set('k', 'v'), await store.delete('k')]

    expect(results.map(codeOf)).toEqual(['DCK-SEC-001', 'DCK-SEC-001', 'DCK-SEC-001'])
  })

  it('should report a refusal with the cause when the Credential Manager fails', async () => {
    const { open } = fakeManager(new Error('Platform secure storage failure'))
    const store = createCredentialStore({ open })

    const results = [await store.get('k'), await store.set('k', 'v'), await store.delete('k')]

    expect(results.map(codeOf)).toEqual(['DCK-SEC-002', 'DCK-SEC-002', 'DCK-SEC-002'])
    expect(results[1]?.ok ? '' : results[1]?.error.message).toContain('secure storage failure')
  })
})

// Writes to the real Credential Manager, so it runs only when asked (CI sets it on Windows)
describe.runIf(process.platform === 'win32' && process.env.DCK_CREDENTIAL_TEST === '1')(
  'createCredentialStore on the Credential Manager',
  () => {
    it('should store, read and delete a secret when the system store is available', async () => {
      const store = createCredentialStore({ service: `dck-test-${randomUUID()}` })

      const saved = await store.set('gitlab.token', 'glpat-123 ção')
      const read = await store.get('gitlab.token')
      const deleted = await store.delete('gitlab.token')
      const after = await store.get('gitlab.token')

      expect(saved.ok).toBe(true)
      expect(read).toEqual({ ok: true, value: 'glpat-123 ção' })
      expect(deleted.ok).toBe(true)
      expect(after).toEqual({ ok: true, value: undefined })
    })
  },
)

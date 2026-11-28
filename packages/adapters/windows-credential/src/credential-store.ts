import { errorBody, fail, ok, type SecretStore } from '@dck/core'

const SERVICE = 'dev-cockpit'

export interface CredentialEntry {
  // Null when the credential does not exist
  getPassword(): Promise<string | null>
  setPassword(password: string): Promise<void>
  // False when there was nothing to delete
  deletePassword(): Promise<boolean>
}

// Undefined when the native module cannot be loaded
export type OpenEntry = (service: string, key: string) => Promise<CredentialEntry | undefined>

// Loaded on first use, so the native module never loads on another system or before a secret is needed
const openSystemEntry: OpenEntry = async (service, key) => {
  const keyring = await import('@napi-rs/keyring').catch(() => undefined)
  return keyring && new keyring.AsyncEntry(service, key)
}

// The Credential Manager's message names the failure, never the value
const refused = (operation: string, error: unknown) =>
  fail(errorBody('DCK-SEC-002', `${operation}: ${String(error)}`))

// Windows' Credential Manager, through keyring-rs: the secret crosses no process boundary and no argument
export function createCredentialStore(
  options: { readonly open?: OpenEntry; readonly service?: string } = {},
): SecretStore {
  const { open = openSystemEntry, service = SERVICE } = options
  return {
    async get(key) {
      const entry = await open(service, key)
      if (!entry) return fail(errorBody('DCK-SEC-001'))
      try {
        return ok((await entry.getPassword()) ?? undefined)
      } catch (error) {
        return refused('read', error)
      }
    },
    async set(key, value) {
      const entry = await open(service, key)
      if (!entry) return fail(errorBody('DCK-SEC-001'))
      try {
        await entry.setPassword(value)
        return ok(undefined)
      } catch (error) {
        return refused('write', error)
      }
    },
    async delete(key) {
      const entry = await open(service, key)
      if (!entry) return fail(errorBody('DCK-SEC-001'))
      try {
        await entry.deletePassword()
        return ok(undefined)
      } catch (error) {
        return refused('delete', error)
      }
    },
  }
}

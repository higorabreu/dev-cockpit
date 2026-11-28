import { MemorySecretStore } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { systemSecretStore } from './secret-store.ts'

const factories = () => {
  const keychain = new MemorySecretStore()
  const credentialManager = new MemorySecretStore()
  const secretTool = new MemorySecretStore()
  return {
    keychain,
    credentialManager,
    secretTool,
    inject: {
      keychain: () => keychain,
      credentialManager: () => credentialManager,
      secretTool: () => secretTool,
    },
  }
}

describe('systemSecretStore', () => {
  it('should pick the Keychain when the platform is darwin', () => {
    const { keychain, inject } = factories()

    const store = systemSecretStore('darwin', inject)

    expect(store).toBe(keychain)
  })

  it('should pick the Credential Manager when the platform is win32', () => {
    const { credentialManager, inject } = factories()

    const store = systemSecretStore('win32', inject)

    expect(store).toBe(credentialManager)
  })

  it.each(['linux', 'freebsd'] as const)(
    'should pick secret-tool when the platform is %s',
    (platform) => {
      const { secretTool, inject } = factories()

      const store = systemSecretStore(platform, inject)

      expect(store).toBe(secretTool)
    },
  )
})

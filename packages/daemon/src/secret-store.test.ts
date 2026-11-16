import { MemorySecretStore } from '@dck/core/testing'
import { describe, expect, it } from 'vitest'
import { systemSecretStore } from './secret-store.ts'

const factories = () => {
  const keychain = new MemorySecretStore()
  const secretTool = new MemorySecretStore()
  return {
    keychain,
    secretTool,
    inject: { keychain: () => keychain, secretTool: () => secretTool },
  }
}

describe('systemSecretStore', () => {
  it('should pick the Keychain when the platform is darwin', () => {
    const { keychain, inject } = factories()

    const store = systemSecretStore('darwin', inject)

    expect(store).toBe(keychain)
  })

  it.each(['linux', 'win32', 'freebsd'] as const)(
    'should pick secret-tool when the platform is %s',
    (platform) => {
      const { secretTool, inject } = factories()

      const store = systemSecretStore(platform, inject)

      expect(store).toBe(secretTool)
    },
  )
})

import { createKeychainStore } from '@dck/adapter-macos-keychain'
import { createSecretToolStore } from '@dck/adapter-secret-tool'
import { createCredentialStore } from '@dck/adapter-windows-credential'
import type { SecretStore } from '@dck/core'

export interface SecretStoreFactories {
  readonly keychain: () => SecretStore
  readonly credentialManager: () => SecretStore
  readonly secretTool: () => SecretStore
}

const systemFactories: SecretStoreFactories = {
  keychain: () => createKeychainStore(),
  credentialManager: () => createCredentialStore(),
  secretTool: () => createSecretToolStore(),
}

// The window's selectPlatform uses this too, so the daemon reads the token where the window wrote it
export function systemSecretStore(
  platform: NodeJS.Platform = process.platform,
  factories: SecretStoreFactories = systemFactories,
): SecretStore {
  if (platform === 'darwin') return factories.keychain()
  if (platform === 'win32') return factories.credentialManager()
  return factories.secretTool()
}

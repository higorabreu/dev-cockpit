import { createKeychainStore } from '@dck/adapter-macos-keychain'
import { createSecretToolStore } from '@dck/adapter-secret-tool'
import type { SecretStore } from '@dck/core'

export interface SecretStoreFactories {
  readonly keychain: () => SecretStore
  readonly secretTool: () => SecretStore
}

const systemFactories: SecretStoreFactories = {
  keychain: () => createKeychainStore(),
  secretTool: () => createSecretToolStore(),
}

// The window's selectPlatform uses this too, so the daemon reads the token where the window wrote it
export function systemSecretStore(
  platform: NodeJS.Platform = process.platform,
  factories: SecretStoreFactories = systemFactories,
): SecretStore {
  return platform === 'darwin' ? factories.keychain() : factories.secretTool()
}

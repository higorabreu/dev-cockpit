import { createKeychainStore } from '@dck/adapter-macos-keychain'
import { createSecretToolStore } from '@dck/adapter-secret-tool'
import type { SecretStore } from '@dck/core'

// The window's selectPlatform uses this too, so the daemon reads the token where the window wrote it
export function systemSecretStore(platform: NodeJS.Platform = process.platform): SecretStore {
  return platform === 'darwin' ? createKeychainStore() : createSecretToolStore()
}

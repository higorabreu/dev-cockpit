import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'

export type SecretResult<T> = Result<T, ErrorBody>

export interface SecretStore {
  // A missing key is not an error: returns undefined
  get(key: string): Promise<SecretResult<string | undefined>>
  set(key: string, value: string): Promise<SecretResult<void>>
  delete(key: string): Promise<SecretResult<void>>
}

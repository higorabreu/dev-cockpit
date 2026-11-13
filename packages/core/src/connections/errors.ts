import type { ErrorCode } from '../errors.ts'
import { type MessageKey, ptBR } from '../i18n/pt-BR.ts'

// A connector's codes get a connection text of their own when the catalogs have one
export function connectionErrorKey(code: ErrorCode): MessageKey {
  const key = `connections.error.${code}`
  return Object.hasOwn(ptBR, key) ? (key as MessageKey) : 'connections.error.unknown'
}

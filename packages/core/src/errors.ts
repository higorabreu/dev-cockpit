import errorCodes from '../error-codes.json' with { type: 'json' }
import { en } from './i18n/en.ts'

// Categories inspired by the canonical gRPC codes and AIP-193
export type ErrorCategory =
  | 'invalid_argument'
  | 'not_found'
  | 'already_exists'
  | 'permission_denied'
  | 'unavailable'
  | 'internal'

export type ErrorCode = keyof typeof errorCodes

export interface ErrorInfo {
  readonly message: string
  readonly category: ErrorCategory
  readonly retryable: boolean
  readonly rpc: number
}

// The registry format is checked by error-codes.test.ts
const registry = errorCodes as unknown as Readonly<Record<ErrorCode, Omit<ErrorInfo, 'message'>>>

// Messages for logs and RPC are the English catalog entries; the interface translates by `error.<code>`
export const describeError = (code: ErrorCode): string => en[`error.${code}`]
export const errorInfo = (code: ErrorCode): ErrorInfo => ({
  ...registry[code],
  message: describeError(code),
})

// The code inside an ErrorBody arrives as text; returns the registered one or the IPC internal error
export function errorCodeOf(body: { readonly data?: { readonly code: string } }): ErrorCode {
  const code = body.data?.code
  return code !== undefined && code in registry ? (code as ErrorCode) : 'DCK-IPC-002'
}

export class DckError extends Error {
  readonly code: ErrorCode
  readonly detail: string | undefined

  constructor(code: ErrorCode, detail?: string) {
    super(detail ? `${describeError(code)}: ${detail}` : describeError(code))
    this.code = code
    this.detail = detail
  }
}

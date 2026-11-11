import errorCodes from '../error-codes.json' with { type: 'json' }

export type ErrorCode = keyof typeof errorCodes

export const describeError = (code: ErrorCode): string => errorCodes[code]

export class DckError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, detail?: string) {
    super(detail ? `${describeError(code)}: ${detail}` : describeError(code))
    this.code = code
  }
}

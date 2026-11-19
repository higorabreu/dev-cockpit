import type { ErrorBody } from '@dck/core'

// Exit codes from sysexits.h, the BSD convention for command-line tools
export const EXIT = { ok: 0, failed: 1, usage: 64, unavailable: 69, software: 70 } as const

export function exitCodeFor(error: ErrorBody): number {
  switch (error.data?.category) {
    case 'invalid_argument':
      return EXIT.usage
    case 'unavailable':
      return EXIT.unavailable
    case 'internal':
      return EXIT.software
    default:
      return EXIT.failed
  }
}

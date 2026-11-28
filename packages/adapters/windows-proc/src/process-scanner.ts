import type { ProcessScanner } from '@dck/core'

// The scan finds daemons too old to answer `shutdown`; none of them ever ran on Windows, and Windows
// gives no other process's environment to tell the development daemon from the installed one
export function createProcessScanner(): ProcessScanner {
  return { find: async () => [] }
}

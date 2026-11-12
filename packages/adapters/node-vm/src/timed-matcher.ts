import { runInNewContext } from 'node:vm'
import type { Matcher } from '@dck/core'

const DEFAULT_TIMEOUT_MS = 100

// A standard from a repository file may carry an expression that backtracks forever; the vm stops it
export function createTimedMatcher(milliseconds = DEFAULT_TIMEOUT_MS): Matcher {
  return (expression, text) => {
    try {
      const matched = runInNewContext(
        'expression.test(text)',
        { expression, text },
        { timeout: milliseconds },
      )
      return matched ? 'match' : 'no-match'
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return 'timeout'
      throw error
    }
  }
}

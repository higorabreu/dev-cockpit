import type { LogContext, Logger } from '@dck/core'

export function createJsonLogger(write: (line: string) => void): Logger {
  const log = (level: string) => (message: string, context?: LogContext) =>
    write(`${JSON.stringify({ time: new Date().toISOString(), level, message, ...context })}\n`)
  return { info: log('info'), warn: log('warn'), error: log('error') }
}

export type LogContext = Readonly<Record<string, unknown>>

export interface Logger {
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} }

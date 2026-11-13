import { describe, expect, it } from 'vitest'
import type { LogContext, Logger } from '../ports/logger.ts'
import { checkProfile } from './profile.ts'

const recordingLogger = () => {
  const errors: { message: string; context?: LogContext }[] = []
  const logger: Logger = {
    info() {},
    warn() {},
    error: (message, context) => errors.push({ message, context }),
  }
  return { logger, errors }
}

describe('checkProfile', () => {
  it.each([undefined, ''])('should use no profile when the variable is %j', (value) => {
    const { logger, errors } = recordingLogger()

    const result = checkProfile(value, logger)

    expect(result).toEqual({ kind: 'valid', profile: undefined })
    expect(errors).toEqual([])
  })

  it.each(['dev', 'e2e.test_2', 'A-b.c_9', 'p'.repeat(64)])(
    'should keep the profile when it is %s',
    (value) => {
      const { logger, errors } = recordingLogger()

      const result = checkProfile(value, logger)

      expect(result).toEqual({ kind: 'valid', profile: value })
      expect(errors).toEqual([])
    },
  )

  it.each([
    { kind: 'has a space', value: 'my profile' },
    { kind: 'has a colon, the key separator', value: 'dev:prod' },
    { kind: 'has a slash', value: 'dev/prod' },
    { kind: 'has a quote', value: 'dev"' },
    { kind: 'has a line break', value: 'dev\nprod' },
    { kind: 'is not ASCII', value: 'produção' },
    { kind: 'is longer than 64 characters', value: 'p'.repeat(65) },
  ])('should refuse the profile and log why when it $kind', ({ value }) => {
    const { logger, errors } = recordingLogger()

    const result = checkProfile(value, logger)

    expect(result).toEqual({ kind: 'invalid' })
    expect(errors).toEqual([
      {
        message: 'DCK_PROFILE must be 1 to 64 letters, digits, dots, underscores or hyphens',
        context: { value },
      },
    ])
  })
})

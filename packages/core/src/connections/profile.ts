import type { Logger } from '../ports/logger.ts'

const PROFILE = /^[A-Za-z0-9._-]{1,64}$/

export type ProfileCheck =
  | { readonly kind: 'valid'; readonly profile: string | undefined }
  | { readonly kind: 'invalid' }

// The profile prefixes every keyring key, so a bad one stops the boot instead of being refused there later
export function checkProfile(value: string | undefined, logger: Logger): ProfileCheck {
  if (value === undefined || value === '') return { kind: 'valid', profile: undefined }
  if (PROFILE.test(value)) return { kind: 'valid', profile: value }
  logger.error('DCK_PROFILE must be 1 to 64 letters, digits, dots, underscores or hyphens', {
    value,
  })
  return { kind: 'invalid' }
}

import type { z } from 'zod'
import type { ExtensionSource } from './load.ts'

// A named place an extension can contribute to, with the shape of what it declares there
export interface ContributionPoint<T> {
  readonly id: string
  readonly schema: z.ZodType<T>
  // The sources whose extensions may contribute here; undefined means every source
  readonly sources?: readonly ExtensionSource[]
  // Why a declaration cannot live beside the ones loaded before it, or undefined when it can
  conflict?(declaration: T, earlier: readonly T[]): string | undefined
}

export const defineContributionPoint = <T>(
  id: string,
  schema: z.ZodType<T>,
  options: Omit<ContributionPoint<T>, 'id' | 'schema'> = {},
): ContributionPoint<T> => ({ id, schema, ...options })

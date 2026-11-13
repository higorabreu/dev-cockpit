import type { z } from 'zod'
import type { ExtensionSource } from './load.ts'

// A named place an extension can contribute to, with the shape of what it declares there
export interface ContributionPoint<T> {
  readonly id: string
  readonly schema: z.ZodType<T>
  // The sources whose extensions may contribute here; undefined means every source
  readonly sources?: readonly ExtensionSource[]
}

export const defineContributionPoint = <T>(
  id: string,
  schema: z.ZodType<T>,
  sources?: readonly ExtensionSource[],
): ContributionPoint<T> => (sources === undefined ? { id, schema } : { id, schema, sources })

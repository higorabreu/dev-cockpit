import type { z } from 'zod'

// A named place an extension can contribute to, with the shape of what it declares there
export interface ContributionPoint<T> {
  readonly id: string
  readonly schema: z.ZodType<T>
}

export const defineContributionPoint = <T>(
  id: string,
  schema: z.ZodType<T>,
): ContributionPoint<T> => ({
  id,
  schema,
})

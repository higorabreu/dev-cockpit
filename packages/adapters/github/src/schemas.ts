import { z } from 'zod'

// `name` is empty when the account never set one
export const userSchema = z.object({
  id: z.number(),
  login: z.string().min(1),
  name: z.string().nullish(),
})

// The search returns the repository as an API link, `<api>/repos/<owner>/<name>`
const REPOSITORY_URL = /\/repos\/([^/]+\/[^/]+)$/

export const searchItemSchema = z.object({
  number: z.number(),
  title: z.string(),
  html_url: z.string(),
  // A deleted account shows as null
  user: z.object({ login: z.string() }).nullable(),
  draft: z.boolean().catch(false),
  updated_at: z.string(),
  repository_url: z
    .string()
    .regex(REPOSITORY_URL)
    .transform((url) => url.match(REPOSITORY_URL)?.[1] ?? url),
  // Present only on a pull request; the search may return issues when the query is changed by hand
  pull_request: z.object({}).optional(),
})

export const searchSchema = z.object({ items: z.array(searchItemSchema) })

// `mergeable` is null while GitHub is still computing it
export const pullSchema = z.object({
  draft: z.boolean().catch(false),
  mergeable: z.boolean().nullish(),
  head: z.object({ ref: z.string(), sha: z.string().min(1) }),
  base: z.object({ ref: z.string() }),
})

export const checkRunsSchema = z.object({
  check_runs: z.array(z.object({ status: z.string(), conclusion: z.string().nullish() })),
})

// The commit statuses older CI services report; `pending` with no status means there is none
export const combinedStatusSchema = z.object({ state: z.string(), total_count: z.number() })

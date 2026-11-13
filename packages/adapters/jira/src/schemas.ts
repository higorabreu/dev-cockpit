import { z } from 'zod'

// The e-mail can be hidden by the account's privacy settings, so it is not required
export const myselfSchema = z.object({
  accountId: z.string().min(1),
  displayName: z.string(),
})

// `new` is to do, `indeterminate` in progress, `done` finished; a status with no category reads as to do
const categorySchema = z.enum(['new', 'indeterminate', 'done']).catch('new')

export const issueSchema = z.object({
  id: z.string(),
  key: z.string().min(1),
  fields: z.object({
    summary: z.string(),
    status: z.object({
      name: z.string(),
      statusCategory: z.object({ key: categorySchema }),
    }),
    issuetype: z.object({ name: z.string() }),
    project: z.object({ key: z.string() }),
    // Jira writes the offset without a colon (`+0000`); stored as ISO so every reader parses it the same
    updated: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a date')
      .transform((value) => new Date(value).toISOString()),
  }),
})

export const searchPageSchema = z.object({
  issues: z.array(issueSchema),
  nextPageToken: z.string().nullish(),
  isLast: z.boolean().optional(),
})

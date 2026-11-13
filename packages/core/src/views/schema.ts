import { z } from 'zod'

export const mergeRequestSummarySchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  project: z.string(),
  author: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
  draft: z.boolean(),
  updatedAt: z.string(),
  hasConflicts: z.boolean(),
  openDiscussions: z.boolean(),
  pipeline: z.enum(['success', 'failed', 'running', 'pending', 'canceled', 'none', 'unknown']),
})

export const issueSummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  summary: z.string(),
  url: z.string(),
  project: z.string(),
  type: z.string(),
  status: z.string(),
  statusCategory: z.enum(['todo', 'progress']),
  updatedAt: z.string(),
})

export const viewItemSchema = z.discriminatedUnion('kind', [
  mergeRequestSummarySchema.extend({ kind: z.literal('mergeRequest') }),
  issueSummarySchema.extend({ kind: z.literal('issue') }),
])

export const VIEW_ID_MAX = 64

// What the daemon publishes and the UI receives; validated at the edge of each process
export const viewSnapshotSchema = z.object({
  view: z.string().min(1).max(VIEW_ID_MAX),
  items: z.array(viewItemSchema),
  updatedAt: z.number().optional(),
  state: z.enum(['unconfigured', 'idle', 'refreshing', 'error']),
  error: z.string().optional(),
})

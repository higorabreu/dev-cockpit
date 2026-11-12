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

// O que o daemon publica e a interface recebe; validado na borda de cada processo
export const viewSnapshotSchema = z.object({
  view: z.enum(['review', 'mine']),
  items: z.array(mergeRequestSummarySchema),
  updatedAt: z.number().optional(),
  state: z.enum(['unconfigured', 'idle', 'refreshing', 'error']),
  error: z.string().optional(),
})

import { z } from 'zod'

export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  name: z.string(),
})

const pipelineSchema = z.object({ status: z.string() }).nullish()

export const mergeRequestSchema = z.object({
  iid: z.number(),
  title: z.string(),
  web_url: z.string(),
  references: z.object({ full: z.string() }),
  author: z.object({ username: z.string() }),
  source_branch: z.string(),
  target_branch: z.string(),
  draft: z.boolean().catch(false),
  updated_at: z.string(),
  has_conflicts: z.boolean().catch(false),
  blocking_discussions_resolved: z.boolean().catch(true),
  head_pipeline: pipelineSchema,
})

export const mergeRequestsSchema = z.array(mergeRequestSchema)

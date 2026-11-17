import { describe, expect, it } from 'vitest'
import { viewItemSchema } from './schema.ts'

const item = {
  kind: 'mergeRequest',
  id: 'acme/backend!5',
  number: 5,
  title: 'Add rate limiting',
  url: 'https://gitlab.example.com/acme/backend/-/merge_requests/5',
  project: 'acme/backend',
  author: 'bruno',
  sourceBranch: 'feat/limits',
  targetBranch: 'main',
  draft: false,
  updatedAt: '2026-11-11T10:00:00Z',
  hasConflicts: false,
  openDiscussions: false,
  pipeline: 'success',
}

describe('viewItemSchema', () => {
  it('should read a merge request stored before the reference mark existed', () => {
    const parsed = viewItemSchema.parse(item)

    expect(parsed.kind === 'mergeRequest' && parsed.referenceMark).toBeUndefined()
  })

  it('should keep the reference mark of a pull request when reading it back', () => {
    const parsed = viewItemSchema.parse({ ...item, id: 'acme/backend#5', referenceMark: '#' })

    expect(parsed.kind === 'mergeRequest' && parsed.referenceMark).toBe('#')
  })

  it('should refuse a reference mark that no service writes', () => {
    expect(viewItemSchema.safeParse({ ...item, referenceMark: '@' }).success).toBe(false)
  })
})

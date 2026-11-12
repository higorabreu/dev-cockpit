import { z } from 'zod'
import { type ErrorBody, errorBody } from '../ipc/protocol.ts'
import { fail, ok, type Result } from '../result.ts'
import { isVersion, isVersionRange } from './version.ts'

// Fields that would need code, which this version of the product never runs
const CODE_FIELDS = ['run', 'main', 'permissions', 'activationEvents'] as const

const manifestSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, 'must look like owner.name, in lowercase'),
  name: z.string().min(1).max(100),
  version: z.string().refine(isVersion, 'must be a version like 1.2.3'),
  description: z.string().max(300).optional(),
  apiVersion: z.number().int().positive(),
  engines: z.strictObject({
    dck: z.string().refine(isVersionRange, 'must be a range like >=0.3.0'),
  }),
  contributes: z.record(z.string().regex(/^[a-z][a-z0-9-]*$/), z.unknown()).default({}),
})

export type Manifest = z.infer<typeof manifestSchema>

const describeIssues = (error: z.ZodError) =>
  error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
    .join('; ')

export function parseManifest(input: unknown): Result<Manifest, ErrorBody> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return fail(errorBody('DCK-EXT-001', 'the manifest must be a JSON object'))
  }
  const needsCode = CODE_FIELDS.filter((field) => field in input)
  if (needsCode.length > 0) {
    return fail(errorBody('DCK-EXT-002', `this version cannot run code: ${needsCode.join(', ')}`))
  }
  const parsed = manifestSchema.safeParse(input)
  return parsed.success
    ? ok(parsed.data)
    : fail(errorBody('DCK-EXT-001', describeIssues(parsed.error)))
}

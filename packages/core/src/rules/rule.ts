import { z } from 'zod'

export const CHECK_KINDS = ['pattern', 'required', 'forbid', 'maxLength'] as const
export type CheckKind = (typeof CHECK_KINDS)[number]

export const ONE_CHECK_KIND = 'needs exactly one of pattern, required, forbid or maxLength'

const name = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'must be lowercase kebab case')
// One line, so a message cannot carry a marker or a heading into the block of AGENTS.md
const text = z
  .string()
  .trim()
  .min(1)
  .regex(/^[^\r\n]*$/, 'must be one line')
// The length limit keeps a user expression cheap to compile and to run
const expression = z.string().min(1).max(500)

export const checkSchema = z
  .strictObject({
    pattern: expression.optional(),
    required: expression.optional(),
    forbid: expression.optional(),
    maxLength: z.number().int().positive().optional(),
    variables: z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/), expression).optional(),
    scope: z.enum(['text', 'first-line']).optional(),
    message: text,
  })
  .refine(
    (check) => CHECK_KINDS.filter((kind) => check[kind] !== undefined).length === 1,
    ONE_CHECK_KIND,
  )

// One file may declare only the fields it changes, so everything but the id is optional here
export const frontMatterSchema = z.strictObject({
  id: name,
  title: text.max(100).optional(),
  applies: name.optional(),
  paths: z.array(z.string()).optional(),
  why: text.optional(),
  enabled: z.boolean().optional(),
  check: z.array(checkSchema).max(20).optional(),
})

export type Check = z.infer<typeof checkSchema>

export interface Rule {
  readonly id: string
  readonly title: string
  readonly applies: string
  // Stored only: no glob matching yet
  readonly paths: readonly string[]
  readonly why: string
  readonly enabled: boolean
  readonly check: readonly Check[]
  readonly body: string
}

export const enabledFor = <T extends Rule>(rules: readonly T[], application: string) =>
  rules.filter((rule) => rule.enabled && rule.applies === application)

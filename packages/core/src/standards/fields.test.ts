import { describe, expect, it } from 'vitest'
import { isNameList, listText, listValue, ruleFields, withRuleField } from './fields.ts'
import type { StandardRule } from './standard.ts'

const check: readonly StandardRule[] = [
  {
    pattern: '^({types})/{ticket}-[a-z0-9-]+$',
    variables: { types: 'feat|fix', ticket: '[A-Z]+-[0-9]+' },
    message: 'Use <type>/<TICKET>-<slug>',
  },
  { maxLength: 60, message: 'At most 60 characters' },
  { forbid: '\\s', message: 'No spaces' },
]

const codeOf = (result: ReturnType<typeof withRuleField>) =>
  result.ok ? undefined : result.error.data?.code

describe('ruleFields', () => {
  it('should list one text field per variable and one number field per length limit when the rules have them', () => {
    const fields = ruleFields({ check })

    expect(fields).toEqual([
      {
        rule: 0,
        name: 'types',
        kind: 'text',
        value: 'feat|fix',
        message: 'Use <type>/<TICKET>-<slug>',
      },
      {
        rule: 0,
        name: 'ticket',
        kind: 'text',
        value: '[A-Z]+-[0-9]+',
        message: 'Use <type>/<TICKET>-<slug>',
      },
      { rule: 1, name: 'maxLength', kind: 'number', value: 60, message: 'At most 60 characters' },
    ])
  })

  it('should list nothing when no rule has a variable or a length limit', () => {
    expect(ruleFields({ check: [{ forbid: '\\s', message: 'No spaces' }] })).toEqual([])
  })
})

describe('withRuleField', () => {
  it('should change only that variable when the field is a variable of the rule', () => {
    const result = withRuleField(check, 0, 'types', 'feat|fix|chore')

    expect(result).toEqual({
      ok: true,
      value: [
        { ...check[0], variables: { types: 'feat|fix|chore', ticket: '[A-Z]+-[0-9]+' } },
        check[1],
        check[2],
      ],
    })
    expect(check[0]?.variables?.types).toBe('feat|fix')
  })

  it('should store a list typed with commas or spaces as names joined by bars when the variable is a list of names', () => {
    const result = withRuleField(check, 0, 'types', 'feat, fix  chore')

    expect(result.ok && result.value[0]?.variables?.types).toBe('feat|fix|chore')
  })

  it('should keep the typed text as it is when the variable is not a list of names', () => {
    const result = withRuleField(check, 0, 'ticket', '[A-Z]{2,}-[0-9]+')

    expect(result.ok && result.value[0]?.variables?.ticket).toBe('[A-Z]{2,}-[0-9]+')
  })

  it('should change the limit when the field is the length limit of the rule', () => {
    const result = withRuleField(check, 1, 'maxLength', 100)

    expect(result.ok && result.value[1]).toEqual({
      maxLength: 100,
      message: 'At most 60 characters',
    })
  })

  it.each([
    ['the rule does not exist', 3, 'types', 'feat'],
    ['the rule has no such variable', 0, 'scope', 'feat'],
    ['the rule has no length limit', 0, 'maxLength', 100],
    ['a variable gets a number', 0, 'types', 5],
    ['the length limit gets text', 1, 'maxLength', '100'],
    ['the length limit is not positive', 1, 'maxLength', 0],
    ['a variable is empty', 0, 'types', ''],
    ['a variable breaks the expression', 0, 'types', 'feat|(fix'],
  ] as const)('should fail with DCK-STD-001 when %s', (_case, rule, name, value) => {
    const result = withRuleField(check, rule, name, value)

    expect(codeOf(result)).toBe('DCK-STD-001')
  })

  it('should name the rule and the field when the change is refused', () => {
    const result = withRuleField(check, 1, 'maxLength', 0)

    expect(result.ok ? '' : result.error.message).toContain('check.1.maxLength: ')
  })
})

describe('name lists', () => {
  it('should read as a list when the value is only names joined by a bar', () => {
    expect(isNameList('feat|fix|docs')).toBe(true)
    expect(isNameList('main')).toBe(true)
    expect(isNameList('[A-Z]+-[0-9]+')).toBe(false)
    expect(isNameList(72)).toBe(false)
  })

  it('should give back the same value when a list is shown and typed again', () => {
    expect(listText('feat|fix|docs')).toBe('feat, fix, docs')
    expect(listValue('feat, fix,docs  chore')).toBe('feat|fix|docs|chore')
    expect(listValue(listText('feat|fix'))).toBe('feat|fix')
  })
})

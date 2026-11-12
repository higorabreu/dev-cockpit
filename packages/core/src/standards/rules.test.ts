import { describe, expect, it } from 'vitest'
import { compileRule } from './rules.ts'

const WHERE = '/home/ana/acme/backend/.dck/standards/branch.md: check.0'

describe('compileRule', () => {
  it('should wrap each variable in a group when the expression names it', () => {
    const rule = {
      pattern: '^{type}/{ticket}-[a-z]+$',
      variables: { type: 'feat|fix', ticket: '[A-Z]+-[0-9]+' },
      message: 'Use <type>/<TICKET>-<slug>',
    }

    const compiled = compileRule(rule, WHERE)

    expect(compiled).toMatchObject({
      ok: true,
      value: { kind: 'pattern', expression: /^(?:feat|fix)\/(?:[A-Z]+-[0-9]+)-[a-z]+$/ },
    })
  })

  it('should leave a quantifier untouched when the braces hold numbers', () => {
    const rule = { required: '^.{1,72}$', variables: { ticket: 'ABC' }, message: 'Too long' }

    const compiled = compileRule(rule, WHERE)

    expect(compiled).toMatchObject({ ok: true, value: { expression: /^.{1,72}$/ } })
  })

  it('should fail with the variable name when the expression uses an unknown variable', () => {
    const rule = { pattern: '^{ticket}-[a-z]+$', variables: { type: 'feat' }, message: 'Bad' }

    const compiled = compileRule(rule, WHERE)

    expect(compiled).toMatchObject({ ok: false, error: { data: { code: 'DCK-STD-001' } } })
    expect(compiled.ok ? '' : compiled.error.message).toContain(
      `${WHERE}.pattern: unknown variable {ticket}`,
    )
  })

  it('should fail instead of throwing when the expression is not a valid regular expression', () => {
    const rule = { forbid: '(unclosed', message: 'Bad' }

    const compiled = compileRule(rule, WHERE)

    expect(compiled).toMatchObject({ ok: false, error: { data: { code: 'DCK-STD-001' } } })
    expect(compiled.ok ? '' : compiled.error.message).toContain(`${WHERE}.forbid`)
  })

  it('should compile the expression with no flags when the rule is a pattern', () => {
    const compiled = compileRule({ pattern: '^feat', message: 'Bad' }, WHERE)

    expect(compiled).toMatchObject({ ok: true, value: { expression: { flags: '' } } })
  })

  it('should keep the limit, the message and the scope when the rule is a maxLength', () => {
    const rule = { maxLength: 72, scope: 'first-line' as const, message: 'Too long' }

    const compiled = compileRule(rule, WHERE)

    expect(compiled).toEqual({
      ok: true,
      value: { kind: 'maxLength', max: 72, scope: 'first-line', message: 'Too long' },
    })
  })

  it('should default the scope to the whole text when the rule does not set one', () => {
    const compiled = compileRule({ maxLength: 10, message: 'Too long' }, WHERE)

    expect(compiled).toMatchObject({ ok: true, value: { scope: 'text' } })
  })

  it('should fail when the rule has no kind at all', () => {
    const compiled = compileRule({ message: 'Nothing to check' }, WHERE)

    expect(compiled).toMatchObject({ ok: false, error: { data: { code: 'DCK-STD-001' } } })
  })
})

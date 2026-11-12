import { describe, expect, it } from 'vitest'
import { checkMessage, compileCheck } from './compile.ts'

const WHERE = '/home/ana/acme/backend/.dck/rules/branch.md: check.0'

describe('compileCheck', () => {
  it('should wrap each variable in a group when the expression names it', () => {
    const check = {
      pattern: '^{type}/{ticket}-[a-z]+$',
      variables: { type: 'feat|fix', ticket: '[A-Z]+-[0-9]+' },
      message: 'Use <type>/<TICKET>-<slug>',
    }

    const compiled = compileCheck(check, WHERE)

    expect(compiled).toMatchObject({
      ok: true,
      value: { kind: 'pattern', expression: /^(?:feat|fix)\/(?:[A-Z]+-[0-9]+)-[a-z]+$/ },
    })
  })

  it('should leave a quantifier untouched when the braces hold numbers', () => {
    const check = { required: '^.{1,72}$', variables: { ticket: 'ABC' }, message: 'Too long' }

    const compiled = compileCheck(check, WHERE)

    expect(compiled).toMatchObject({ ok: true, value: { expression: /^.{1,72}$/ } })
  })

  it('should fail with the variable name when the expression uses an unknown variable', () => {
    const check = { pattern: '^{ticket}-[a-z]+$', variables: { type: 'feat' }, message: 'Bad' }

    const compiled = compileCheck(check, WHERE)

    expect(compiled).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-001' } } })
    expect(compiled.ok ? '' : compiled.error.message).toContain(
      `${WHERE}.pattern: unknown variable {ticket}`,
    )
  })

  it('should fail instead of throwing when the expression is not a valid regular expression', () => {
    const check = { forbid: '(unclosed', message: 'Bad' }

    const compiled = compileCheck(check, WHERE)

    expect(compiled).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-001' } } })
    expect(compiled.ok ? '' : compiled.error.message).toContain(`${WHERE}.forbid`)
  })

  it('should compile the expression with no flags when the check is a pattern', () => {
    const compiled = compileCheck({ pattern: '^feat', message: 'Bad' }, WHERE)

    expect(compiled).toMatchObject({ ok: true, value: { expression: { flags: '' } } })
  })

  it('should keep the limit, the message and the scope when the check is a maxLength', () => {
    const check = { maxLength: 72, scope: 'first-line' as const, message: 'Too long' }

    const compiled = compileCheck(check, WHERE)

    expect(compiled).toEqual({
      ok: true,
      value: { kind: 'maxLength', max: 72, scope: 'first-line', message: 'Too long' },
    })
  })

  it('should default the scope to the whole text when the check does not set one', () => {
    const compiled = compileCheck({ maxLength: 10, message: 'Too long' }, WHERE)

    expect(compiled).toMatchObject({ ok: true, value: { scope: 'text' } })
  })

  it('should fail when the check has no kind at all', () => {
    const compiled = compileCheck({ message: 'Nothing to check' }, WHERE)

    expect(compiled).toMatchObject({ ok: false, error: { data: { code: 'DCK-RUL-001' } } })
  })
})

describe('checkMessage', () => {
  it('should name the current values when the message refers to the check fields', () => {
    const check = {
      pattern: '^({types}): .+$',
      variables: { types: 'feat|fix' },
      message: 'Start with one of {types}',
    }

    expect(checkMessage(check)).toBe('Start with one of feat, fix')
    expect(checkMessage({ maxLength: 50, message: 'At most {maxLength} characters' })).toBe(
      'At most 50 characters',
    )
  })

  it('should leave the braces alone when they name no field of the check', () => {
    expect(checkMessage({ maxLength: 50, message: 'Use {ticket} first' })).toBe(
      'Use {ticket} first',
    )
  })
})

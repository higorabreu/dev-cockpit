import { createTranslator, SYNTAX_COLOR_KEYS, TERMINAL_COLOR_KEYS } from '@dck/core'
import { type ContrastCheck, contrastChecks, resolveTheme, tokens, withTheme } from '@dck/design'
import { describe, expect, it } from 'vitest'
import { contrastLabel, contrastTip } from './contrast-labels.ts'

const failing = (foreground: string, background: string, ratio: number): ContrastCheck => ({
  name: `${foreground} on ${background}`,
  foreground,
  background,
  ratio,
  minimum: 4.5,
  passes: false,
})

describe('contrastLabel', () => {
  it('should name a syntax role and a ground in plain words when both have a label', () => {
    const en = createTranslator('en')

    expect(contrastLabel(en, 'syntax.comment', 'text')).toBe('Comments')
    expect(contrastLabel(en, 'colors.searchMatch', 'ground')).toBe('the search highlight')
  })

  it('should name a derived fill by what it is when the check reads one', () => {
    const pt = createTranslator('pt-BR')
    const selection = `color-mix(colors.fg ${tokens.mix.lineSelected}%, colors.bg)`

    expect(contrastLabel(pt, selection, 'ground')).toBe('a seleção')
  })

  it('should show the reference as written when it has no label', () => {
    expect(contrastLabel(createTranslator('en'), 'colors.glow', 'text')).toBe('colors.glow')
  })

  it('should have a label for every color any contrast check of a theme reads', () => {
    const en = createTranslator('en')
    const unlabeled = (['dark', 'light'] as const).flatMap((type) =>
      contrastChecks(withTheme(tokens, type, resolveTheme(tokens, type, [])), type).flatMap(
        (check) => [
          ...(contrastLabel(en, check.foreground, 'text') === check.foreground
            ? [check.foreground]
            : []),
          ...(contrastLabel(en, check.background, 'ground') === check.background
            ? [check.background]
            : []),
        ],
      ),
    )

    expect([...new Set(unlabeled)]).toEqual([])
  })

  it('should label every syntax role and terminal color when listing the theme keys', () => {
    const en = createTranslator('en')

    const missing = [
      ...SYNTAX_COLOR_KEYS.map((name) => `syntax.${name}`),
      ...TERMINAL_COLOR_KEYS.map((name) => `terminal.${name}`),
    ].filter((ref) => contrastLabel(en, ref, 'text') === ref)

    expect(missing).toEqual([])
  })
})

describe('contrastTip', () => {
  it('should write each pair in plain words with its ratio rounded down when there are a few', () => {
    const tip = contrastTip(createTranslator('en'), [
      failing('syntax.comment', 'colors.searchMatch', 1.19),
    ])

    expect(tip).toBe('Comments on the search highlight: 1.1 of 4.5')
  })

  it('should write the numbers with a decimal comma when the language is Portuguese', () => {
    const tip = contrastTip(createTranslator('pt-BR'), [
      failing('syntax.comment', 'colors.searchMatch', 1.19),
    ])

    expect(tip).toBe('Comentários sobre o destaque da busca: 1,1 de 4,5')
  })

  it('should list five pairs and count the rest when there are more', () => {
    const failures = Array.from({ length: 8 }, (_, index) =>
      failing('syntax.comment', 'colors.bg', 1 + index / 10),
    )

    const lines = contrastTip(createTranslator('en'), failures).split('\n')

    expect(lines).toHaveLength(6)
    expect(lines.at(-1)).toBe('and 3 more')
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Rule {
  readonly file: string
  // The at-rules around it, such as `@media (prefers-reduced-motion: no-preference)`
  readonly context: string
  readonly selector: string
  readonly declarations: readonly { readonly property: string; readonly value: string }[]
}

// Every rule of every stylesheet with the at-rules it sits in, so a rule inside @media keeps its condition
function parse(file: string, css: string): Rule[] {
  const rules: Rule[] = []
  const preludes: string[] = []
  let text = ''
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') {
      preludes.push(text.trim())
      text = ''
    } else if (char === '}') {
      const selector = preludes.pop() ?? ''
      if (!selector.startsWith('@')) {
        const declarations = text
          .split(';')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const colon = line.indexOf(':')
            return { property: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() }
          })
        rules.push({ file, context: preludes.join(' '), selector, declarations })
      }
      text = ''
    } else text += char
  }
  return rules
}

const rules = readdirSync(import.meta.dirname)
  .filter((file) => file.endsWith('.css'))
  .flatMap((file) => parse(file, readFileSync(join(import.meta.dirname, file), 'utf8')))

const MOTION = /^(transition|animation)(-duration|-delay)?$/
const NO_PREFERENCE = '@media (prefers-reduced-motion: no-preference)'

// The surfaces that open or close in place and move as the maintainer's rule says (2026-11-19)
const OPENING = [
  /\.fv-strip/,
  /#tab-menu/,
  /#search\b/,
  /#files\b/,
  /\.fv-search|\.fv-drawer-ghost/,
  /\.tabview\[data-moving\]/,
  /#panel\b/,
]

const moving = (rule: Rule) => rule.declarations.filter((line) => MOTION.test(line.property))

describe('motion', () => {
  it('should time every transition and animation with a motion token when reading the styles', () => {
    // Arrange
    const timed = rules.flatMap((rule) =>
      moving(rule).map((line) => ({ where: `${rule.file} ${rule.selector}`, value: line.value })),
    )

    // Act: a zero delay or duration is no time of its own (a visibility that flips at the end)
    const literal = timed.filter(({ value }) =>
      [...value.matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)\b/g)].some((match) => Number(match[1]) !== 0),
    )

    // Assert
    expect(literal).toEqual([])
  })

  it('should move the surfaces that open and close only when the system allows motion', () => {
    // Arrange
    const surfaces = rules.filter(
      (rule) => OPENING.some((pattern) => pattern.test(rule.selector)) && moving(rule).length > 0,
    )

    // Act
    const ungated = surfaces
      .filter((rule) => rule.context !== NO_PREFERENCE)
      .map((rule) => `${rule.file} ${rule.selector}`)

    // Assert
    expect(surfaces.length).toBeGreaterThan(0)
    expect(ungated).toEqual([])
  })

  it('should move only opacity, transform and the size of what opens when the surfaces open and close', () => {
    // Arrange
    const allowed = /^(opacity|transform|visibility|grid-template-rows|width|flex-basis)$/
    const transitions = rules
      .filter((rule) => OPENING.some((pattern) => pattern.test(rule.selector)))
      .flatMap((rule) =>
        rule.declarations
          .filter((line) => line.property === 'transition')
          .flatMap((line) => line.value.split(','))
          .map((part) => ({
            where: `${rule.file} ${rule.selector}`,
            property: part.trim().split(/\s+/)[0] ?? '',
          })),
      )

    // Act
    const others = transitions.filter(({ property }) => !allowed.test(property))

    // Assert
    expect(transitions.length).toBeGreaterThan(0)
    expect(others).toEqual([])
  })

  it('should change only opacity, transform and the size of what opens when reading the keyframes', () => {
    // Arrange
    const frames = rules.filter((rule) => rule.context.startsWith('@keyframes'))

    // Act
    const others = frames.flatMap((rule) =>
      rule.declarations
        .filter((line) => !/^(opacity|transform|grid-template-rows)$/.test(line.property))
        .map((line) => `${rule.file} ${rule.context} ${line.property}`),
    )

    // Assert
    expect(frames.length).toBeGreaterThan(0)
    expect(others).toEqual([])
  })

  it('should end every transition and animation at once when the system asks for reduced motion', () => {
    // Arrange
    const net = rules.find(
      (rule) =>
        rule.file === 'base.css' &&
        rule.context === '@media (prefers-reduced-motion: reduce)' &&
        rule.selector.includes('*'),
    )

    // Act
    const values = Object.fromEntries(
      (net?.declarations ?? []).map((line) => [line.property, line.value]),
    )

    // Assert
    expect(values['transition-duration']).toBe('0s !important')
    expect(values['animation-duration']).toBe('0s !important')
    expect(values['transition-delay']).toBe('0s !important')
    expect(values['animation-delay']).toBe('0s !important')
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = import.meta.dirname
const source = join(styles, '..')
const read = (path: string) => readFileSync(path, 'utf8')
const base = read(join(styles, 'base.css'))

const sourceFiles = (folder: string): string[] =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  })

// Roles a user activates with a click; the others (dialog, listbox, status) are containers
const CLICKABLE_ROLES = ['button', 'tab', 'option', 'menuitem', 'switch', 'link']

describe('pointer cursor', () => {
  it('should load the base rule before every other stylesheet when the styles are imported', () => {
    const imports = [...read(join(styles, 'index.css')).matchAll(/@import "\.\/([^"]+)"/g)]

    expect(imports[0]?.[1]).toBe('base.css')
  })

  it('should give the pointer to every native control and clickable role when listing the base rule', () => {
    const roles = sourceFiles(source)
      .flatMap((file) =>
        [...read(file).matchAll(/role: '([a-z]+)'/g)].map((match) => match[1] ?? ''),
      )
      .filter((role) => CLICKABLE_ROLES.includes(role))

    for (const selector of ['button', 'select', 'input[type="checkbox"]', 'input[type="range"]']) {
      expect(base, selector).toContain(selector)
    }
    for (const role of new Set([...roles, ...CLICKABLE_ROLES])) {
      expect(base, role).toContain(`[role="${role}"]`)
    }
  })

  it('should not take the pointer away from a control when a stylesheet sets another cursor', () => {
    const offenders = readdirSync(styles)
      .filter((name) => name.endsWith('.css') && name !== 'base.css')
      .flatMap((name) =>
        [...read(join(styles, name)).matchAll(/([^{}]+)\{[^}]*cursor:\s*(default|auto)/g)]
          .map((match) => (match[1] ?? '').trim())
          .filter((selector) => /\b(button|select)\b|role=/.test(selector))
          .filter((selector) => !/:disabled|aria-disabled/.test(selector))
          .map((selector) => `${name}: ${selector}`),
      )

    expect(offenders).toEqual([])
  })
})

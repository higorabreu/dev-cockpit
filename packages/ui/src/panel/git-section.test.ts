// @vitest-environment happy-dom
import {
  createTranslator,
  type GitStatus,
  type Locale,
  type RuleMarks,
  type SessionSnapshot,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createGitSection } from './git-section.ts'

const git: GitStatus = {
  root: '/home/ana/acme/backend',
  branch: 'Feature/Login',
  upstream: 'origin/main',
  changed: 0,
  staged: [],
  changes: [],
  ahead: 2,
  behind: 0,
  outgoing: [
    { hash: 'b3ebb5f', subject: 'fix: handle empty input', time: 0 },
    { hash: 'e9be7eb', subject: 'updated things', time: 0 },
  ],
  incoming: [],
  submodules: [],
  submodulesClean: 0,
}

const failed = (...messages: string[]) => ({ failed: messages, slow: [] })

function bodyOf(rules?: RuleMarks, locale: Locale = 'en', opened: string[] = []): HTMLElement {
  const snapshot: SessionSnapshot = {
    cwd: git.root,
    process: 'zsh',
    activity: 'idle',
    git,
    ...(rules ? { rules } : {}),
  }
  const section = createGitSection(
    { snapshot: () => snapshot, requestRender() {}, openRules: () => opened.push('harness') },
    createTranslator(locale),
  )
  return section.body()
}

const marksIn = (element: Element | null | undefined) => [
  ...(element?.querySelectorAll('.rule-mark') ?? []),
]

describe('createGitSection rules marks', () => {
  it('should mark the branch with the failed checks in its tooltip when it is outside a rule', () => {
    const body = bodyOf({ branch: failed('Use <type>/<short-slug>', 'No capitals'), commits: {} })

    const [mark, ...others] = marksIn(body.querySelector('.brow'))

    expect(others).toEqual([])
    expect(mark?.previousElementSibling?.textContent).toBe('Feature/Login')
    expect(mark?.getAttribute('data-tip')).toBe(
      'Outside the rules: Use <type>/<short-slug>; No capitals',
    )
  })

  it('should mark only the commit that fails when one commit not pushed yet is outside a rule', () => {
    const body = bodyOf({ commits: { e9be7eb: failed('Start with <type>: <summary>') } })

    const rows = [...body.querySelectorAll('.frow')]

    expect(marksIn(body.querySelector('.brow'))).toEqual([])
    expect(rows.map((row) => marksIn(row).length)).toEqual([0, 1])
    expect(marksIn(rows[1])[0]?.getAttribute('data-tip')).toBe(
      'Outside the rules: Start with <type>: <summary>',
    )
  })

  it('should say the state as a drawing with a text for readers, not by color alone, when it marks', () => {
    const body = bodyOf({ branch: failed('Use <type>/<short-slug>'), commits: {} })

    const mark = marksIn(body)[0]

    expect(mark?.querySelector('svg.glyph-warning')).not.toBeNull()
    expect(mark?.getAttribute('aria-label')).toBe(mark?.getAttribute('data-tip'))
    expect(mark?.hasAttribute('title')).toBe(false)
  })

  it('should be a button that keeps its focus key and opens the rules when it is pressed', () => {
    const opened: string[] = []
    const body = bodyOf({ branch: failed('Use <type>/<short-slug>'), commits: {} }, 'en', opened)
    const mark = marksIn(body)[0]

    ;(mark as HTMLButtonElement | undefined)?.click()

    expect(mark?.tagName).toBe('BUTTON')
    expect(mark?.getAttribute('type')).toBe('button')
    expect(mark?.getAttribute('data-focus')).toBe('git-mark-branch')
    expect(opened).toEqual(['harness'])
  })

  it('should say a check was not checked instead of failed when it ran out of time', () => {
    const body = bodyOf({
      branch: { failed: ['No capitals'], slow: ['Use <type>/<short-slug>'] },
      commits: { e9be7eb: { failed: [], slow: ['Start with <type>: <summary>'] } },
    })

    const [branch, commit] = marksIn(body)

    expect(branch?.getAttribute('data-tip')).toBe(
      'Outside the rules: No capitals. Not checked, too slow: Use <type>/<short-slug>',
    )
    expect(commit?.getAttribute('data-tip')).toBe(
      'Not checked, too slow: Start with <type>: <summary>',
    )
  })

  it('should draw the section as before when the snapshot carries no rules', () => {
    const body = bodyOf()

    expect(marksIn(body)).toEqual([])
    expect(
      [...(body.querySelector('.brow')?.children ?? [])].map((child) => child.tagName),
    ).toEqual(['svg', 'B', 'SPAN'])
  })

  it('should write the tooltip in Portuguese when that is the language', () => {
    const body = bodyOf({ branch: failed('Use <type>/<short-slug>'), commits: {} }, 'pt-BR')

    expect(marksIn(body)[0]?.getAttribute('data-tip')).toBe(
      'Fora das regras: Use <type>/<short-slug>',
    )
  })
})

// @vitest-environment happy-dom
import {
  createTranslator,
  type GitStatus,
  type Locale,
  type SessionSnapshot,
  type StandardMarks,
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

function bodyOf(standards?: StandardMarks, locale: Locale = 'en'): HTMLElement {
  const snapshot: SessionSnapshot = {
    cwd: git.root,
    process: 'zsh',
    activity: 'idle',
    git,
    ...(standards ? { standards } : {}),
  }
  const section = createGitSection(
    { snapshot: () => snapshot, requestRender() {} },
    createTranslator(locale),
  )
  return section.body()
}

const marksIn = (element: Element | null | undefined) => [
  ...(element?.querySelectorAll('.std-mark') ?? []),
]

describe('createGitSection standards marks', () => {
  it('should mark the branch with the failed rules in its tooltip when it is outside a standard', () => {
    const body = bodyOf({ branch: ['Use <type>/<short-slug>', 'No capitals'], commits: {} })

    const [mark, ...others] = marksIn(body.querySelector('.brow'))

    expect(others).toEqual([])
    expect(mark?.previousElementSibling?.textContent).toBe('Feature/Login')
    expect(mark?.getAttribute('data-tip')).toBe(
      'Outside the standards: Use <type>/<short-slug>; No capitals',
    )
  })

  it('should mark only the commit that fails when one commit not pushed yet is outside a standard', () => {
    const body = bodyOf({ branch: [], commits: { e9be7eb: ['Start with <type>: <summary>'] } })

    const rows = [...body.querySelectorAll('.frow')]

    expect(marksIn(body.querySelector('.brow'))).toEqual([])
    expect(rows.map((row) => marksIn(row).length)).toEqual([0, 1])
    expect(marksIn(rows[1])[0]?.getAttribute('data-tip')).toBe(
      'Outside the standards: Start with <type>: <summary>',
    )
  })

  it('should say the state as a drawing with a text for readers, not by color alone, when it marks', () => {
    const body = bodyOf({ branch: ['Use <type>/<short-slug>'], commits: {} })

    const mark = marksIn(body)[0]

    expect(mark?.querySelector('svg.glyph-warning')).not.toBeNull()
    expect(mark?.getAttribute('role')).toBe('img')
    expect(mark?.getAttribute('aria-label')).toBe(mark?.getAttribute('data-tip'))
    expect(mark?.hasAttribute('title')).toBe(false)
  })

  it('should draw the section as before when the snapshot carries no standards', () => {
    const body = bodyOf()

    expect(marksIn(body)).toEqual([])
    expect(
      [...(body.querySelector('.brow')?.children ?? [])].map((child) => child.tagName),
    ).toEqual(['svg', 'B', 'SPAN'])
  })

  it('should write the tooltip in Portuguese when that is the language', () => {
    const body = bodyOf({ branch: ['Use <type>/<short-slug>'], commits: {} }, 'pt-BR')

    expect(marksIn(body)[0]?.getAttribute('data-tip')).toBe(
      'Fora dos padrões: Use <type>/<short-slug>',
    )
  })
})

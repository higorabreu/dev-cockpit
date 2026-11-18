// @vitest-environment happy-dom
import {
  createTranslator,
  type GitStatus,
  JIRA_CONNECTOR,
  jiraTicketLink,
  type SessionSnapshot,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createGitSection } from './git-section.ts'

const git = (branch: string, extra: Partial<GitStatus> = {}): GitStatus => ({
  root: '/home/ana/acme',
  branch,
  upstream: `origin/${branch}`,
  changed: 0,
  staged: [],
  changes: [],
  ahead: 0,
  behind: 0,
  outgoing: [],
  incoming: [],
  submodules: [],
  submodulesClean: 0,
  ...extra,
})

// What the window holds: a Jira site when an account is connected and the projects of its loaded tasks
function draw(
  branch: string,
  jira?: { site: string; projects: readonly string[] },
  extra: Partial<GitStatus> = {},
) {
  const opened: string[] = []
  const modules: string[] = []
  const snapshot: SessionSnapshot = {
    cwd: '/home/ana/acme',
    process: 'zsh',
    activity: 'idle',
    git: git(branch, extra),
  }
  const section = createGitSection(
    {
      snapshot: () => snapshot,
      requestRender: () => undefined,
      ticket: (name) => jiraTicketLink(name, jira?.site, new Set(jira?.projects ?? [])),
      openTicket: (url) => void opened.push(url),
      openModule: (path) => void modules.push(path),
    },
    createTranslator('en'),
  )
  const body = section.body()
  document.body.replaceChildren(body)
  return { body, opened, modules }
}

describe('git section ticket', () => {
  const jira = { site: 'https://acme.atlassian.net', projects: ['ACME'] }

  it('should show the key as a link to the Jira issue when its project is one of the user tasks', () => {
    const { body, opened } = draw('feature/ACME-42-login', jira)

    const chip = body.querySelector<HTMLButtonElement>('button.ticket')
    chip?.click()

    expect(chip?.textContent).toBe('ACME-42')
    expect(chip?.dataset.tip).toBe(`Open ACME-42 in ${JIRA_CONNECTOR.name}`)
    expect(chip?.hasAttribute('title')).toBe(false)
    expect(opened).toEqual(['https://acme.atlassian.net/browse/ACME-42'])
  })

  it('should show no ticket when Jira is not connected even if the branch looks like one', () => {
    const { body } = draw('feature/ACME-42-login')

    expect(body.querySelector('.ticket')).toBeNull()
    expect(body.querySelectorAll('.lrow > *')).toHaveLength(1)
  })

  it('should show no ticket when the key is from a project the user has no task in', () => {
    const { body } = draw('feature/NTF-400-api', jira)

    expect(body.querySelector('.ticket')).toBeNull()
  })
})

describe('git section remote', () => {
  it('should name the remote branch Git records when there are commits to push', () => {
    const { body } = draw('feature/login', undefined, {
      upstream: 'fork/feature/login',
      ahead: 1,
      outgoing: [{ hash: 'abc1234', subject: 'Add login', time: 1 }],
    })

    const head = body.querySelector<HTMLElement>('[data-focus="git-outgoing"]')

    expect(head?.dataset.tip).toBe('Local commits not pushed to fork/feature/login yet')
  })
})

describe('git section submodules', () => {
  it('should open the review on a submodule when its row is clicked', () => {
    // Arrange
    const { body, modules } = draw('main', undefined, {
      submodules: [{ path: 'libs/lib', changed: 2, ahead: 1, behind: 0 }],
    })
    const row = body.querySelector<HTMLButtonElement>('button.frow-open')

    // Act
    row?.click()

    // Assert
    expect(modules).toEqual(['libs/lib'])
    expect(row?.dataset.tip).toBe('Review changes')
    expect(row?.getAttribute('aria-label')).toBe('Review changes in libs/lib, 2 changes')
    expect(row?.dataset.focus).toBe('git-module-libs/lib')
  })
})

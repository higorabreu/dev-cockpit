import { describe, expect, it } from 'vitest'
import { connectorCatalog, connectorOfView } from './catalog.ts'
import { GITHUB_CONNECTOR } from './github.ts'
import { GITLAB_CONNECTOR } from './gitlab.ts'
import { JIRA_CONNECTOR } from './jira.ts'

const catalog = (disabled: string[], implemented: string[] = ['github', 'gitlab', 'jira']) =>
  connectorCatalog({
    appVersion: '0.3.0',
    disabled: new Set(disabled),
    implemented: new Set(implemented),
  })

describe('connectorCatalog', () => {
  it('should offer GitHub, GitLab and Jira in their order when nothing is disabled', () => {
    expect(catalog([]).ready.map((connector) => connector.id)).toEqual(['github', 'gitlab', 'jira'])
  })

  it('should offer only GitHub and Jira when GitLab is disabled', () => {
    const result = catalog(['dck.gitlab'])

    expect(result.ready).toEqual([GITHUB_CONNECTOR, JIRA_CONNECTOR])
    expect(result.disabled).toEqual([{ extension: 'dck.gitlab', id: 'gitlab', name: 'GitLab' }])
  })

  it('should leave GitLab out and list it as disabled when its extension is disabled', () => {
    const result = catalog(['dck.github', 'dck.gitlab', 'dck.jira'])

    expect(result.ready).toEqual([])
    expect(result.missing).toEqual([])
    expect(result.disabled).toEqual([
      { extension: 'dck.github', id: 'github', name: 'GitHub' },
      { extension: 'dck.gitlab', id: 'gitlab', name: 'GitLab' },
      { extension: 'dck.jira', id: 'jira', name: 'Jira' },
    ])
  })

  it('should not offer to enable a disabled connector the process has no code for', () => {
    expect(catalog(['dck.gitlab'], []).disabled).toEqual([])
  })

  it('should offer GitLab again when its extension is enabled after being disabled', () => {
    const before = catalog(['dck.gitlab'])

    const after = catalog([])

    expect(before.ready).toEqual([GITHUB_CONNECTOR, JIRA_CONNECTOR])
    expect(after.ready).toEqual([GITHUB_CONNECTOR, GITLAB_CONNECTOR, JIRA_CONNECTOR])
  })

  it('should keep GitLab when another extension is disabled', () => {
    expect(catalog(['dck.built-in']).ready).toEqual([
      GITHUB_CONNECTOR,
      GITLAB_CONNECTOR,
      JIRA_CONNECTOR,
    ])
  })

  it('should report a declared connector and leave it out when the process has no code for it', () => {
    const result = catalog([], [])

    expect(result.ready).toEqual([])
    expect(result.missing.map((connector) => connector.id)).toEqual(['github', 'gitlab', 'jira'])
  })
})

describe('connectorOfView', () => {
  it('should find the connector that declared the view when it is listed', () => {
    expect(connectorOfView([GITLAB_CONNECTOR], 'mine')?.id).toBe('gitlab')
  })

  it('should find nothing when no listed connector declares the view', () => {
    expect(connectorOfView([GITLAB_CONNECTOR], 'tasks')).toBeUndefined()
  })

  it('should find Jira for the tasks view when both connectors are listed', () => {
    expect(connectorOfView([GITLAB_CONNECTOR, JIRA_CONNECTOR], 'tasks')?.id).toBe('jira')
  })

  it('should tell the GitHub review view from the GitLab one when both are listed', () => {
    const listed = [GITHUB_CONNECTOR, GITLAB_CONNECTOR]

    expect(connectorOfView(listed, 'github-review')?.id).toBe('github')
    expect(connectorOfView(listed, 'review')?.id).toBe('gitlab')
  })
})

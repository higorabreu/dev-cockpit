import { describe, expect, it } from 'vitest'
import { connectorCatalog, connectorOfView } from './catalog.ts'
import { GITLAB_CONNECTOR } from './gitlab.ts'

const catalog = (disabled: string[], implemented: string[] = ['gitlab']) =>
  connectorCatalog({
    appVersion: '0.3.0',
    disabled: new Set(disabled),
    implemented: new Set(implemented),
  })

describe('connectorCatalog', () => {
  it('should offer GitLab when nothing is disabled', () => {
    expect(catalog([]).ready.map((connector) => connector.id)).toEqual(['gitlab'])
  })

  it('should leave GitLab out when its extension is disabled', () => {
    const result = catalog(['dck.gitlab'])

    expect(result.ready).toEqual([])
    expect(result.missing).toEqual([])
  })

  it('should offer GitLab again when its extension is enabled after being disabled', () => {
    const before = catalog(['dck.gitlab'])

    const after = catalog([])

    expect(before.ready).toEqual([])
    expect(after.ready).toEqual([GITLAB_CONNECTOR])
  })

  it('should keep GitLab when another extension is disabled', () => {
    expect(catalog(['dck.built-in']).ready).toEqual([GITLAB_CONNECTOR])
  })

  it('should report a declared connector and leave it out when the process has no code for it', () => {
    const result = catalog([], [])

    expect(result.ready).toEqual([])
    expect(result.missing.map((connector) => connector.id)).toEqual(['gitlab'])
  })
})

describe('connectorOfView', () => {
  it('should find the connector that declared the view when it is listed', () => {
    expect(connectorOfView([GITLAB_CONNECTOR], 'mine')?.id).toBe('gitlab')
  })

  it('should find nothing when no listed connector declares the view', () => {
    expect(connectorOfView([GITLAB_CONNECTOR], 'tasks')).toBeUndefined()
  })
})

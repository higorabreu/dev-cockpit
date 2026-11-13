import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connectorTokenKey, GITLAB_CONNECTOR, JIRA_CONNECTOR, silentLogger } from '@dck/core'
import { MemorySecretStore } from '@dck/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConnectorViews } from './connector-views.ts'

// Records which keys are read; the store stays empty, so no view reaches the network
class RecordingSecretStore extends MemorySecretStore {
  readonly read: string[] = []
  override async get(key: string) {
    this.read.push(key)
    return super.get(key)
  }
}

let stateDir = ''
beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), 'dck-connector-views-'))
})
afterEach(() => rm(stateDir, { recursive: true, force: true }))

describe('createConnectorViews', () => {
  it("should read each connector's token from the given store when its views refresh", async () => {
    // Arrange
    const secrets = new RecordingSecretStore()
    const views = createConnectorViews({ stateDir, logger: silentLogger, secrets, profile: 'dev' })
    const gitlab = views.get(GITLAB_CONNECTOR.id)
    const jira = views.get(JIRA_CONNECTOR.id)
    await gitlab?.configure({ url: 'https://gitlab.example.com' })
    await jira?.configure({ url: 'https://acme.example.com', email: 'ana@example.com' })

    // Act
    await gitlab?.refresh(GITLAB_CONNECTOR.views[0].id)
    await jira?.refresh(JIRA_CONNECTOR.views[0].id)

    // Assert
    expect(secrets.read).toEqual([
      connectorTokenKey(GITLAB_CONNECTOR.id, 'dev'),
      connectorTokenKey(JIRA_CONNECTOR.id, 'dev'),
    ])
    expect((await gitlab?.snapshot(GITLAB_CONNECTOR.views[0].id))?.state).toBe('unconfigured')
  })
})

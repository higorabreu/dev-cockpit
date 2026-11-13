import { describe, expect, it } from 'vitest'
import {
  builtInExtensions,
  CONTRIBUTION_POINTS,
  EXTENSION_API_VERSION,
} from '../extensions/built-in.ts'
import { contributionsFor, type ExtensionCandidate, loadExtensions } from '../extensions/load.ts'
import { connectorSchema, connectorsPoint } from './connector.ts'
import { GITLAB_CONNECTOR } from './gitlab.ts'
import { JIRA_CONNECTOR } from './jira.ts'

const tracker = {
  id: 'tracker',
  name: 'Acme Tracker',
  connection: {
    address: { placeholder: 'https://tracker.example.com' },
    email: { placeholder: 'ana@example.com' },
    token: { label: 'connections.gitlab.token', hint: 'connections.gitlab.token.hint' },
  },
  views: [{ id: 'tasks', kind: 'issue', title: 'views.review', empty: 'views.empty.review' }],
}

const manifest = (contributes: unknown) => ({
  id: 'acme.tracker',
  name: 'Acme Tracker',
  version: '1.0.0',
  apiVersion: EXTENSION_API_VERSION,
  engines: { dck: '>=0.3.0' },
  contributes,
})

const load = (candidates: readonly ExtensionCandidate[], disabled: string[] = []) =>
  loadExtensions({
    candidates,
    points: CONTRIBUTION_POINTS,
    disabled: new Set(disabled),
    apiVersion: EXTENSION_API_VERSION,
    appVersion: '0.3.0',
  })

describe('connectors contribution point', () => {
  it('should hand the GitLab connector to the consumer when the built-in extensions load', () => {
    const report = load(builtInExtensions('0.3.0'))

    const connectors = contributionsFor(report, connectorsPoint)

    expect(report.rejected).toEqual([])
    expect(connectors.map(({ extension }) => extension.manifest.id)).toEqual([
      'dck.gitlab',
      'dck.jira',
    ])
    expect(connectors[0]?.declaration).toEqual([GITLAB_CONNECTOR])
    expect(connectors[1]?.declaration).toEqual([JIRA_CONNECTOR])
  })

  it.each([
    ['installed', '/home/ana/.config/dev-cockpit/extensions/acme.tracker'],
    ['global', '/home/ana/.config/dev-cockpit'],
    ['repository', '/home/ana/acme/backend/.dck'],
  ] as const)(
    'should refuse a connector with a clear reason when it comes from the %s source',
    (source, location) => {
      const candidate: ExtensionCandidate = {
        source,
        location,
        manifest: manifest({ connectors: [tracker] }),
      }

      const report = load([candidate])

      expect(report.active).toEqual([])
      expect(report.rejected).toHaveLength(1)
      expect(report.rejected[0]?.error.data?.code).toBe('DCK-EXT-002')
      expect(report.rejected[0]?.error.message).toContain(
        'acme.tracker contributes connectors, which only built-in extensions can do in this version',
      )
    },
  )

  it('should refuse the declaration when a text is not a key of the catalogs', () => {
    const parsed = connectorSchema.safeParse({
      ...tracker,
      views: [{ ...tracker.views[0], title: 'Tasks' }],
    })

    expect(parsed.success).toBe(false)
  })

  it.each([
    ['an id with capitals', { ...tracker, id: 'Tracker' }],
    ['no view', { ...tracker, views: [] }],
    ['an unknown item kind', { ...tracker, views: [{ ...tracker.views[0], kind: 'epic' }] }],
    ['a field nobody reads', { ...tracker, icon: 'bug' }],
  ])('should refuse the declaration when it has %s', (_label, declaration) => {
    expect(connectorSchema.safeParse(declaration).success).toBe(false)
  })

  it('should accept an address, an e-mail, a token and an issue view when declared together', () => {
    expect(connectorSchema.safeParse(tracker).success).toBe(true)
  })

  it('should keep connector ids and view ids unique when listing the built-in connectors', () => {
    const connectors = contributionsFor(load(builtInExtensions('0.3.0')), connectorsPoint).flatMap(
      ({ declaration }) => declaration,
    )
    const views = connectors.flatMap((connector) => connector.views.map((view) => view.id))

    expect(new Set(connectors.map((connector) => connector.id)).size).toBe(connectors.length)
    expect(new Set(views).size).toBe(views.length)
  })
})

describe('connectors with clashing ids', () => {
  const builtIn = (id: string, connectors: unknown): ExtensionCandidate => ({
    source: 'built-in',
    location: 'built-in',
    manifest: { ...manifest({ connectors }), id },
  })

  it('should refuse the later connector with the reason when its view id is already loaded', () => {
    const clashing = { ...tracker, views: [{ ...tracker.views[0], id: 'review' }] }

    const report = load([...builtInExtensions('0.3.0'), builtIn('dck.tracker', [clashing])])

    expect(
      contributionsFor(report, connectorsPoint).map(({ extension }) => extension.manifest.id),
    ).toEqual(['dck.gitlab', 'dck.jira'])
    expect(report.rejected.map(({ error }) => [error.data?.code, error.message])).toEqual([
      [
        'DCK-EXT-001',
        'Invalid extension manifest: dck.tracker contributes.connectors: view id review is already used by connector gitlab',
      ],
    ])
  })

  it('should refuse the later connector when its id is already loaded', () => {
    const report = load([
      ...builtInExtensions('0.3.0'),
      builtIn('dck.other', [{ ...tracker, id: 'gitlab' }]),
    ])

    expect(report.rejected[0]?.error.message).toContain('connector id gitlab is already used')
  })

  it('should load the later connector when the one it clashed with is disabled', () => {
    const clashing = { ...tracker, views: [{ ...tracker.views[0], id: 'review' }] }

    const report = load(
      [...builtInExtensions('0.3.0'), builtIn('dck.tracker', [clashing])],
      ['dck.gitlab'],
    )

    expect(report.rejected).toEqual([])
    expect(report.active.map((extension) => extension.manifest.id)).toContain('dck.tracker')
  })

  it('should refuse one declaration that repeats a view id across its own connectors', () => {
    const twin = { ...tracker, id: 'twin' }

    const report = load([builtIn('dck.tracker', [tracker, twin])])

    expect(report.rejected[0]?.error.message).toContain(
      'view id tasks is already used by connector tracker',
    )
  })
})

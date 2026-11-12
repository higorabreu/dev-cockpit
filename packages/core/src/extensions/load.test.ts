import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineContributionPoint } from './contribution-points.ts'
import {
  contributionsFor,
  type ExtensionCandidate,
  type ExtensionSource,
  type LoadOptions,
  loadExtensions,
} from './load.ts'

const standards = defineContributionPoint('standards', z.string().startsWith('standards'))

const manifest = (overrides: Record<string, unknown> = {}) => ({
  id: 'acme.commits',
  name: 'Commits',
  version: '1.0.0',
  apiVersion: 1,
  engines: { dck: '>=0.3.0' },
  contributes: { standards: 'standards/' },
  ...overrides,
})

const candidate = (
  source: ExtensionSource,
  location: string,
  overrides: Record<string, unknown> = {},
): ExtensionCandidate => ({ source, location, manifest: manifest(overrides) })

const load = (candidates: readonly ExtensionCandidate[], disabled: string[] = []) =>
  loadExtensions({
    candidates,
    points: [standards],
    disabled: new Set(disabled),
    apiVersion: 1,
    appVersion: '0.3.0',
  } satisfies LoadOptions)

const codeOf = (error: { data?: { code: string } }) => error.data?.code

describe('loadExtensions', () => {
  it('should load an extension when the manifest is valid and its contribution point is known', () => {
    const report = load([candidate('installed', '/ext/acme.commits')])

    expect(report.active.map((extension) => extension.manifest.id)).toEqual(['acme.commits'])
    expect(report.active[0]?.declarations.get('standards')).toBe('standards/')
    expect(report.rejected).toEqual([])
  })

  it('should reject the extension with DCK-EXT-001 when the manifest is invalid', () => {
    const report = load([candidate('installed', '/ext/bad', { id: 'BAD' })])

    expect(report.active).toEqual([])
    expect(codeOf(report.rejected[0]?.error ?? {})).toBe('DCK-EXT-001')
    expect(report.rejected[0]?.location).toBe('/ext/bad')
  })

  it('should reject the extension with DCK-EXT-002 when the manifest needs code', () => {
    const report = load([candidate('installed', '/ext/code', { main: 'index.js' })])

    expect(codeOf(report.rejected[0]?.error ?? {})).toBe('DCK-EXT-002')
  })

  it('should reject the extension with DCK-EXT-002 when it uses an unknown contribution point', () => {
    const report = load([candidate('installed', '/ext/x', { contributes: { connectors: 'c/' } })])

    expect(codeOf(report.rejected[0]?.error ?? {})).toBe('DCK-EXT-002')
    expect(report.rejected[0]?.error.message).toContain('connectors')
  })

  it('should reject the extension with DCK-EXT-001 when a declaration does not match the point', () => {
    const report = load([
      candidate('installed', '/ext/x', { contributes: { standards: 'rules/' } }),
    ])

    expect(codeOf(report.rejected[0]?.error ?? {})).toBe('DCK-EXT-001')
    expect(report.rejected[0]?.error.message).toContain('contributes.standards')
  })

  it.each([
    ['an api version this build does not know', { apiVersion: 2 }],
    ['an engines range the app does not satisfy', { engines: { dck: '>=1.0.0' } }],
  ])('should reject the extension with DCK-EXT-003 when it needs %s', (_name, overrides) => {
    const report = load([candidate('installed', '/ext/x', overrides)])

    expect(codeOf(report.rejected[0]?.error ?? {})).toBe('DCK-EXT-003')
  })

  it('should keep the higher source and list the lower one as shadowed when the id repeats', () => {
    const report = load([
      candidate('built-in', '/builtin/acme.commits'),
      candidate('repository', '/repo/.dck'),
      candidate('installed', '/ext/acme.commits'),
    ])

    expect(report.active.map((extension) => extension.source)).toEqual(['repository'])
    expect(report.shadowed.map((entry) => entry.extension.source).sort()).toEqual([
      'built-in',
      'installed',
    ])
    expect(report.shadowed.every((entry) => entry.by.source === 'repository')).toBe(true)
  })

  it('should reject the later one when the same id appears twice in the same source', () => {
    const report = load([
      candidate('installed', '/ext/b-copy'),
      candidate('installed', '/ext/a-original'),
    ])

    expect(report.active.map((extension) => extension.location)).toEqual(['/ext/a-original'])
    expect(report.rejected.map((entry) => entry.location)).toEqual(['/ext/b-copy'])
    expect(codeOf(report.rejected[0]?.error ?? {})).toBe('DCK-EXT-001')
  })

  it('should list a disabled extension apart and leave out its contributions when it is disabled', () => {
    const report = load([candidate('installed', '/ext/acme.commits')], ['acme.commits'])

    expect(report.active).toEqual([])
    expect(report.disabled.map((extension) => extension.manifest.id)).toEqual(['acme.commits'])
    expect(contributionsFor(report, standards)).toEqual([])
  })

  it('should order the active extensions from the lowest to the highest precedence when listing', () => {
    const report = load([
      candidate('repository', '/repo', { id: 'repo.local' }),
      candidate('built-in', '/builtin', { id: 'dck.examples' }),
      candidate('global', '/global', { id: 'me.global' }),
      candidate('installed', '/ext', { id: 'acme.commits' }),
    ])

    expect(report.active.map((extension) => extension.source)).toEqual([
      'built-in',
      'installed',
      'global',
      'repository',
    ])
  })
})

describe('contributionsFor', () => {
  it('should return what each active extension declared in precedence order when listing a point', () => {
    const report = load([
      candidate('repository', '/repo', {
        id: 'repo.local',
        contributes: { standards: 'standards/r' },
      }),
      candidate('built-in', '/builtin', {
        id: 'dck.examples',
        contributes: { standards: 'standards/b' },
      }),
      candidate('installed', '/ext', { id: 'acme.commits', contributes: {} }),
    ])

    const contributions = contributionsFor(report, standards)

    expect(contributions.map((entry) => entry.declaration)).toEqual(['standards/b', 'standards/r'])
  })
})

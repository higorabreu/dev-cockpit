import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_EXTENSION_ID,
  builtInExtension,
  CONTRIBUTION_POINTS,
  EXTENSION_API_VERSION,
  RULES_POINT,
} from './built-in.ts'
import { contributionsFor, type ExtensionCandidate, loadExtensions } from './load.ts'

const load = (
  candidates: readonly ExtensionCandidate[],
  appVersion: string,
  disabled: string[] = [],
) =>
  loadExtensions({
    candidates,
    points: CONTRIBUTION_POINTS,
    disabled: new Set(disabled),
    apiVersion: EXTENSION_API_VERSION,
    appVersion,
  })

const installed: ExtensionCandidate = {
  source: 'installed',
  location: '/home/ana/.config/dck/extensions/acme.commits',
  manifest: {
    id: 'acme.commits',
    name: 'Commits',
    version: '1.0.0',
    apiVersion: EXTENSION_API_VERSION,
    engines: { dck: '>=0.3.0' },
  },
}

const pack = (rules: unknown): ExtensionCandidate => ({
  ...installed,
  manifest: { ...(installed.manifest as object), contributes: { rules } },
})

describe('RULES_POINT', () => {
  it.each(['rules', 'team/rules'])(
    'should accept the folder %s when it is inside the extension',
    (folder) => {
      const report = load([pack(folder)], '0.3.0')

      expect(contributionsFor(report, RULES_POINT).map((item) => item.declaration)).toEqual([
        folder,
      ])
    },
  )

  it.each(['', '..', '../rules', 'a/../../b', '/etc/rules', 'C:/rules', 'a\\b', 7])(
    'should refuse the folder %j when it is not a folder inside the extension',
    (folder) => {
      const report = load([pack(folder)], '0.3.0')

      expect(report.active).toEqual([])
      expect(report.rejected[0]?.error.data?.code).toBe('DCK-EXT-001')
    },
  )
})

describe('builtInExtension', () => {
  it('should contribute its rules folder when it goes through the loader', () => {
    const report = load([builtInExtension('0.3.0')], '0.3.0')

    expect(contributionsFor(report, RULES_POINT)).toMatchObject([
      { extension: { source: 'built-in' }, declaration: 'rules' },
    ])
  })

  it('should load as an active extension from the built-in source when it goes through the loader', () => {
    const candidate = builtInExtension('0.3.0')

    const report = load([candidate], '0.3.0')

    expect(report.rejected).toEqual([])
    expect(report.active).toHaveLength(1)
    expect(report.active[0]?.manifest.id).toBe(BUILT_IN_EXTENSION_ID)
    expect(report.active[0]?.manifest.version).toBe('0.3.0')
    expect(report.active[0]?.source).toBe('built-in')
  })

  it('should come before an installed extension in the same report when both are loaded together', () => {
    const candidates = [installed, builtInExtension('0.3.0')]

    const report = load(candidates, '0.3.0')

    expect(report.active.map((extension) => [extension.manifest.id, extension.source])).toEqual([
      [BUILT_IN_EXTENSION_ID, 'built-in'],
      ['acme.commits', 'installed'],
    ])
  })

  it('should still fit the running build when the app version has a pre-release suffix', () => {
    const candidate = builtInExtension('1.4.2-beta.1')

    const report = load([candidate], '1.4.2-beta.1')

    expect(report.rejected).toEqual([])
    expect(report.active[0]?.manifest.version).toBe('1.4.2-beta.1')
  })

  it('should be refused like any other candidate when it was made for another app version', () => {
    const candidate = builtInExtension('0.2.0')

    const report = load([candidate], '0.3.0')

    expect(report.active).toEqual([])
    expect(report.rejected[0]?.error.data?.code).toBe('DCK-EXT-003')
  })

  it('should contribute nothing when the user disabled it', () => {
    const candidate = builtInExtension('0.3.0')

    const report = load([candidate], '0.3.0', [BUILT_IN_EXTENSION_ID])

    expect(report.active).toEqual([])
    expect(report.disabled.map((extension) => extension.manifest.id)).toEqual([
      BUILT_IN_EXTENSION_ID,
    ])
  })

  it('should be shadowed like an installed one when a higher source repeats its id', () => {
    const override: ExtensionCandidate = { ...builtInExtension('0.3.0'), source: 'global' }

    const report = load([builtInExtension('0.3.0'), override], '0.3.0')

    expect(report.active.map((extension) => extension.source)).toEqual(['global'])
    expect(report.shadowed[0]?.extension.source).toBe('built-in')
  })

  it('should stay active when an installed extension claims its id', () => {
    const impostor: ExtensionCandidate = {
      ...builtInExtension('0.3.0'),
      source: 'installed',
      location: '/home/ana/.config/dev-cockpit/extensions/dck.built-in',
    }

    const report = load([builtInExtension('0.3.0'), impostor], '0.3.0')

    expect(report.active.map((extension) => extension.source)).toEqual(['built-in'])
    expect(report.rejected[0]?.error.data?.code).toBe('DCK-EXT-001')
    expect(report.rejected[0]?.error.message).toContain('reserved')
  })
})

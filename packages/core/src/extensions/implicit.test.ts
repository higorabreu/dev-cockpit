import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineContributionPoint } from './contribution-points.ts'
import { implicitManifest } from './implicit.ts'
import { loadExtensions } from './load.ts'
import { parseManifest } from './manifest.ts'

describe('implicitManifest', () => {
  it('should build a manifest the parser accepts when the source is the global folder', () => {
    const manifest = implicitManifest({
      source: 'global',
      apiVersion: 1,
      appVersion: '0.3.0',
      contributes: { standards: 'standards' },
    })

    const parsed = parseManifest(manifest)

    expect(parsed).toEqual({ ok: true, value: manifest })
    expect(manifest).toMatchObject({
      id: 'dck.global',
      apiVersion: 1,
      engines: { dck: '>=0.3.0' },
      contributes: { standards: 'standards' },
    })
  })

  it('should use its own id when the source is the repository folder', () => {
    const manifest = implicitManifest({
      source: 'repository',
      apiVersion: 1,
      appVersion: '0.3.0',
      contributes: {},
    })

    expect(manifest.id).toBe('dck.repository')
    expect(manifest.contributes).toEqual({})
    expect(parseManifest(manifest).ok).toBe(true)
  })

  it('should load in the running app when its version has a pre-release suffix', () => {
    const point = defineContributionPoint('standards', z.string())
    const manifest = implicitManifest({
      source: 'repository',
      apiVersion: 2,
      appVersion: '1.4.0-beta.2',
      contributes: { standards: 'standards' },
    })

    const report = loadExtensions({
      candidates: [{ source: 'repository', location: '/home/ana/acme/backend/.dck', manifest }],
      points: [point],
      disabled: new Set(),
      apiVersion: 2,
      appVersion: '1.4.0-beta.2',
    })

    expect(report.rejected).toEqual([])
    expect(report.active.map((extension) => extension.manifest.id)).toEqual(['dck.repository'])
  })

  it('should not share the given record when building the manifest', () => {
    const contributes = { standards: 'standards' }

    const manifest = implicitManifest({
      source: 'global',
      apiVersion: 1,
      appVersion: '0.3.0',
      contributes,
    })

    expect(manifest.contributes).not.toBe(contributes)
  })
})

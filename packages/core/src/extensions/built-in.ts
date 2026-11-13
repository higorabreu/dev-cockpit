import { connectorsPoint } from '../connectors/connector.ts'
import { GITLAB_CONNECTOR, GITLAB_EXTENSION } from '../connectors/gitlab.ts'
import type { ContributionPoint } from './contribution-points.ts'
import type { ExtensionCandidate } from './load.ts'
import { releaseOf } from './version.ts'

// The manifest API version this build understands
export const EXTENSION_API_VERSION = 1

export const BUILT_IN_EXTENSION_ID = 'dck.built-in'

// Every contribution point this build knows
export const CONTRIBUTION_POINTS: readonly ContributionPoint<unknown>[] = [connectorsPoint]

interface BuiltInManifest {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly contributes: Readonly<Record<string, unknown>>
}

const candidate = (appVersion: string, manifest: BuiltInManifest): ExtensionCandidate => ({
  source: 'built-in',
  location: 'built-in',
  manifest: {
    ...manifest,
    version: appVersion,
    apiVersion: EXTENSION_API_VERSION,
    engines: { dck: `=${releaseOf(appVersion)}` },
  },
})

// Shipped as data and loaded like any other candidate, so built-in and installed share one contract
export function builtInExtension(appVersion: string): ExtensionCandidate {
  return candidate(appVersion, {
    id: BUILT_IN_EXTENSION_ID,
    name: 'Built-in',
    description: 'What ships with the app',
    contributes: {},
  })
}

// Everything that ships with the app, the connectors included; each one can be disabled on its own
export function builtInExtensions(appVersion: string): readonly ExtensionCandidate[] {
  return [
    builtInExtension(appVersion),
    candidate(appVersion, { ...GITLAB_EXTENSION, contributes: { connectors: [GITLAB_CONNECTOR] } }),
  ]
}

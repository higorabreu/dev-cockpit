import type { ContributionPoint } from './contribution-points.ts'
import type { ExtensionCandidate } from './load.ts'
import { releaseOf } from './version.ts'

// The manifest API version this build understands
export const EXTENSION_API_VERSION = 1

export const BUILT_IN_EXTENSION_ID = 'dck.built-in'

// Every contribution point this build knows; empty until the harness registers `standards`
export const CONTRIBUTION_POINTS: readonly ContributionPoint<unknown>[] = []

// Shipped as data and loaded like any other candidate, so built-in and installed share one contract
export function builtInExtension(appVersion: string): ExtensionCandidate {
  return {
    source: 'built-in',
    location: 'built-in',
    manifest: {
      id: BUILT_IN_EXTENSION_ID,
      name: 'Built-in',
      version: appVersion,
      description: 'What ships with the app',
      apiVersion: EXTENSION_API_VERSION,
      engines: { dck: `=${releaseOf(appVersion)}` },
      contributes: {},
    },
  }
}

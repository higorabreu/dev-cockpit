import { z } from 'zod'
import { type ContributionPoint, defineContributionPoint } from './contribution-points.ts'
import type { ExtensionCandidate } from './load.ts'
import { releaseOf } from './version.ts'

// The manifest API version this build understands
export const EXTENSION_API_VERSION = 1

export const BUILT_IN_EXTENSION_ID = 'dck.built-in'

const isInside = (folder: string) =>
  !/^\/|^[A-Za-z]:|\\/.test(folder) && !folder.split('/').includes('..')

// The declaration is the folder that holds the rule files, relative to the extension
export const RULES_POINT = defineContributionPoint(
  'rules',
  z
    .string()
    .min(1)
    .max(200)
    .refine(isInside, 'must be a folder inside the extension, written with forward slashes'),
)

// Every contribution point this build knows
export const CONTRIBUTION_POINTS: readonly ContributionPoint<unknown>[] = [RULES_POINT]

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
      // The examples are data in the core, so this folder is only a name
      contributes: { [RULES_POINT.id]: 'rules' },
    },
  }
}

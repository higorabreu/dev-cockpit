import type { ExtensionSource } from './load.ts'
import type { Manifest } from './manifest.ts'
import { releaseOf } from './version.ts'

export type ImplicitSource = Extract<ExtensionSource, 'global' | 'repository'>

export const IMPLICIT_EXTENSIONS = {
  global: { id: 'dck.global', name: 'Global' },
  repository: { id: 'dck.repository', name: 'Repository' },
} as const satisfies Record<ImplicitSource, { id: string; name: string }>

export interface ImplicitManifestOptions {
  readonly source: ImplicitSource
  readonly apiVersion: number
  readonly appVersion: string
  // Contribution point id to the folder that holds it, relative to the implicit extension
  readonly contributes: Readonly<Record<string, string>>
}

// The manifest a global or repository folder would have written, so it loads like any other extension
export function implicitManifest(options: ImplicitManifestOptions): Manifest {
  const version = releaseOf(options.appVersion)
  return {
    ...IMPLICIT_EXTENSIONS[options.source],
    version,
    apiVersion: options.apiVersion,
    engines: { dck: `>=${version}` },
    contributes: { ...options.contributes },
  }
}

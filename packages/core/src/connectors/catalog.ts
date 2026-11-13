import {
  builtInExtensions,
  CONTRIBUTION_POINTS,
  EXTENSION_API_VERSION,
} from '../extensions/built-in.ts'
import { contributionsFor, loadExtensions } from '../extensions/load.ts'
import { type Connector, connectorsPoint } from './connector.ts'

export interface ConnectorCatalog {
  // Enabled and implemented by this app: these are drawn and connected
  readonly ready: readonly Connector[]
  // Enabled, but this app has no code for them: reported and left out, never half-loaded
  readonly missing: readonly Connector[]
}

export interface ConnectorCatalogOptions {
  readonly appVersion: string
  // The `extensions.disabled` setting
  readonly disabled: ReadonlySet<string>
  // The connector ids whose implementation ships in the running process
  readonly implemented: ReadonlySet<string>
}

// Only built-in extensions may declare a connector, so the other sources are not read here
export function connectorCatalog(options: ConnectorCatalogOptions): ConnectorCatalog {
  const report = loadExtensions({
    candidates: builtInExtensions(options.appVersion),
    points: CONTRIBUTION_POINTS,
    disabled: options.disabled,
    apiVersion: EXTENSION_API_VERSION,
    appVersion: options.appVersion,
  })
  const declared = contributionsFor(report, connectorsPoint).flatMap(
    (contribution) => contribution.declaration,
  )
  return {
    ready: declared.filter((connector) => options.implemented.has(connector.id)),
    missing: declared.filter((connector) => !options.implemented.has(connector.id)),
  }
}

// The connector a view belongs to, among the given ones
export const connectorOfView = (
  connectors: readonly Connector[],
  view: string,
): Connector | undefined =>
  connectors.find((connector) => connector.views.some((candidate) => candidate.id === view))

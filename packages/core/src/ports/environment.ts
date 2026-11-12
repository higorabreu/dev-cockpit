export type ContainerState = 'running' | 'starting' | 'stopped' | 'paused'

export interface ComposeContainer {
  readonly service: string
  readonly name: string
  readonly state: ContainerState
  readonly health: 'healthy' | 'unhealthy' | undefined
  // Original Docker text, like "Up 17 hours (healthy)", for the tooltip
  readonly status: string
}

export type ComposeStatus =
  | { readonly kind: 'none' }
  | { readonly kind: 'unavailable' }
  | {
      readonly kind: 'ok'
      readonly project: string
      readonly containers: readonly ComposeContainer[]
    }

export interface ComposeInspector {
  // Finds the compose file starting from the directory and reads the state of its containers
  status(cwd: string): Promise<ComposeStatus>
}

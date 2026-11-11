export type ContainerState = 'running' | 'starting' | 'stopped' | 'paused'

export interface ComposeContainer {
  readonly service: string
  readonly name: string
  readonly state: ContainerState
  readonly health: 'healthy' | 'unhealthy' | undefined
  // Texto original do Docker, como "Up 17 hours (healthy)", para o tooltip
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
  // Procura o arquivo compose a partir do diretório e lê o estado dos containers dele
  status(cwd: string): Promise<ComposeStatus>
}

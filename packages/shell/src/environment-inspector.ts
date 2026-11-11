import type { ComposeInspector, ComposeStatus, ProcessInspector } from '@dck/core'

export interface EnvironmentInspectorDeps {
  readonly processes: ProcessInspector
  readonly compose: ComposeInspector
}

export function createEnvironmentInspector({ processes, compose }: EnvironmentInspectorDeps) {
  return {
    // O compose é o do diretório em que a aba está agora
    async status(pid: number): Promise<ComposeStatus> {
      const info = await processes.inspect(pid)
      return info ? compose.status(info.cwd) : { kind: 'none' }
    },
  }
}

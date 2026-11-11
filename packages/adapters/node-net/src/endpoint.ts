import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface EndpointEnvironment {
  readonly platform: NodeJS.Platform
  readonly runtimeDir: string | undefined
  readonly uid: number | undefined
}

// Unix usa um socket em arquivo; o Windows usa um named pipe, que o módulo net aceita da mesma forma
export function defaultEndpoint(
  environment: EndpointEnvironment = {
    platform: process.platform,
    runtimeDir: process.env.XDG_RUNTIME_DIR,
    uid: process.getuid?.(),
  },
): string {
  if (environment.platform === 'win32') return '\\\\.\\pipe\\dck-daemon'
  const directory = environment.runtimeDir
    ? join(environment.runtimeDir, 'dck')
    : join(tmpdir(), `dck-${environment.uid ?? 'user'}`)
  return join(directory, 'daemon.sock')
}

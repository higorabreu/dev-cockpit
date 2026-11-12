import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export interface EndpointEnvironment {
  readonly platform: NodeJS.Platform
  readonly runtimeDir: string | undefined
  readonly uid: number | undefined
}

// Unix uses a socket file; Windows uses a named pipe, which the net module accepts the same way
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

export interface StateDirEnvironment {
  readonly platform: NodeJS.Platform
  readonly home: string
  readonly stateHome: string | undefined
  readonly localAppData: string | undefined
}

// Where data that survives logout lives, such as the views cache
export function defaultStateDir(
  environment: StateDirEnvironment = {
    platform: process.platform,
    home: homedir(),
    stateHome: process.env.XDG_STATE_HOME,
    localAppData: process.env.LOCALAPPDATA,
  },
): string {
  if (environment.platform === 'win32')
    return join(environment.localAppData ?? join(environment.home, 'AppData', 'Local'), 'dck')
  return join(environment.stateHome || join(environment.home, '.local', 'state'), 'dck')
}

export interface ConfigDirEnvironment {
  readonly platform: NodeJS.Platform
  readonly home: string
  readonly configHome: string | undefined
  readonly appData: string | undefined
}

// Linux folders are lowercase with no spaces; macOS and Windows show the product name
const LINUX_FOLDER = 'dev-cockpit'
const PRODUCT_FOLDER = 'Dev Cockpit'

// Where settings.json and the extensions live: the window sets it as its data folder and the CLI reads it
export function defaultConfigDir(
  environment: ConfigDirEnvironment = {
    platform: process.platform,
    home: homedir(),
    configHome: process.env.XDG_CONFIG_HOME,
    appData: process.env.APPDATA,
  },
): string {
  if (environment.platform === 'win32')
    return join(environment.appData ?? join(environment.home, 'AppData', 'Roaming'), PRODUCT_FOLDER)
  if (environment.platform === 'darwin')
    return join(environment.home, 'Library', 'Application Support', PRODUCT_FOLDER)
  return join(environment.configHome || join(environment.home, '.config'), LINUX_FOLDER)
}

import { homedir, tmpdir } from 'node:os'
import { posix, win32 } from 'node:path'

export interface EndpointEnvironment {
  readonly platform: NodeJS.Platform
  readonly runtimeDir: string | undefined
  readonly tmpDir: string
  readonly uid: number | undefined
}

// Joined by the platform asked for, not the host's, so one system's paths can be computed and tested on another
const pathsOf = (platform: NodeJS.Platform) => (platform === 'win32' ? win32 : posix)

// sun_path holds 104 bytes on macOS and 108 elsewhere, the closing NUL included
const socketPathMax = (platform: NodeJS.Platform) => (platform === 'darwin' ? 103 : 107)

// Unix uses a socket file; Windows uses a named pipe, which the net module accepts the same way
export function defaultEndpoint(
  environment: EndpointEnvironment = {
    platform: process.platform,
    runtimeDir: process.env.XDG_RUNTIME_DIR,
    tmpDir: tmpdir(),
    uid: process.getuid?.(),
  },
): string {
  if (environment.platform === 'win32') return '\\\\.\\pipe\\dck-daemon'
  const { join } = posix
  const user = `dck-${environment.uid ?? 'user'}`
  const directory = environment.runtimeDir
    ? join(environment.runtimeDir, 'dck')
    : join(environment.tmpDir, user)
  const socket = join(directory, 'daemon.sock')
  // A long TMPDIR would make the socket fail to bind; /tmp is short and the folder is created 0700
  if (Buffer.byteLength(socket) <= socketPathMax(environment.platform)) return socket
  return join('/tmp', user, 'daemon.sock')
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
  const { join } = pathsOf(environment.platform)
  if (environment.platform === 'win32')
    return join(environment.localAppData ?? join(environment.home, 'AppData', 'Local'), 'dck')
  if (environment.platform === 'darwin')
    return join(environment.home, 'Library', 'Application Support', 'dck')
  return join(environment.stateHome || join(environment.home, '.local', 'state'), 'dck')
}

export interface LogDirEnvironment {
  readonly platform: NodeJS.Platform
  readonly home: string
}

// Where the daemon's log goes: the Mac's Console.app reads ~/Library/Logs; elsewhere beside the socket
export function defaultLogDir(
  endpoint: string,
  environment: LogDirEnvironment = { platform: process.platform, home: homedir() },
): string {
  const { dirname, join } = pathsOf(environment.platform)
  if (environment.platform === 'darwin') return join(environment.home, 'Library', 'Logs', 'dck')
  return dirname(endpoint)
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
  const { join } = pathsOf(environment.platform)
  if (environment.platform === 'win32')
    return join(environment.appData ?? join(environment.home, 'AppData', 'Roaming'), PRODUCT_FOLDER)
  if (environment.platform === 'darwin')
    return join(environment.home, 'Library', 'Application Support', PRODUCT_FOLDER)
  return join(environment.configHome || join(environment.home, '.config'), LINUX_FOLDER)
}

import { describe, expect, it } from 'vitest'
import { defaultConfigDir, defaultEndpoint, defaultLogDir, defaultStateDir } from './endpoint.ts'

describe('defaultEndpoint', () => {
  const macTmp = '/var/folders/ab/cdefgh0123456789/T'

  it('should use the runtime directory when the platform provides one', () => {
    const result = defaultEndpoint({
      platform: 'linux',
      runtimeDir: '/run/user/1000',
      tmpDir: '/tmp',
      uid: 1000,
    })

    expect(result).toBe('/run/user/1000/dck/daemon.sock')
  })

  it('should fall back to the temporary directory with the user id when there is no runtime directory', () => {
    const result = defaultEndpoint({
      platform: 'darwin',
      runtimeDir: undefined,
      tmpDir: macTmp,
      uid: 501,
    })

    expect(result).toBe(`${macTmp}/dck-501/daemon.sock`)
  })

  it('should use a short folder in /tmp when the temporary directory makes the socket path too long', () => {
    const longTmp = `/Users/ana/${'x'.repeat(90)}/T`

    const result = defaultEndpoint({
      platform: 'darwin',
      runtimeDir: undefined,
      tmpDir: longTmp,
      uid: 501,
    })

    expect(result).toBe('/tmp/dck-501/daemon.sock')
  })

  it('should keep a socket path of 104 to 107 bytes when the platform is Linux', () => {
    const runtimeDir = `/run/${'x'.repeat(107 - '/run//dck/daemon.sock'.length)}`

    const linux = defaultEndpoint({ platform: 'linux', runtimeDir, tmpDir: '/tmp', uid: 1000 })
    const mac = defaultEndpoint({ platform: 'darwin', runtimeDir, tmpDir: '/tmp', uid: 501 })

    expect(Buffer.byteLength(linux)).toBe(107)
    expect(mac).toBe('/tmp/dck-501/daemon.sock')
  })

  it('should use a named pipe when the platform is Windows', () => {
    const result = defaultEndpoint({
      platform: 'win32',
      runtimeDir: undefined,
      tmpDir: 'C:\\Temp',
      uid: undefined,
    })

    expect(result).toBe('\\\\.\\pipe\\dck-daemon')
  })
})

describe('defaultLogDir', () => {
  it('should use the Logs folder in the Library when the platform is macOS', () => {
    const result = defaultLogDir('/tmp/dck-501/daemon.sock', {
      platform: 'darwin',
      home: '/Users/ana',
    })

    expect(result).toBe('/Users/ana/Library/Logs/dck')
  })

  it('should use the socket folder when the platform is Linux', () => {
    const result = defaultLogDir('/run/user/1000/dck/daemon.sock', {
      platform: 'linux',
      home: '/home/ana',
    })

    expect(result).toBe('/run/user/1000/dck')
  })
})

describe('defaultStateDir', () => {
  const base = {
    platform: 'linux' as const,
    home: '/home/u',
    stateHome: undefined,
    localAppData: undefined,
  }

  it('should use the XDG state home when it is set', () => {
    expect(defaultStateDir({ ...base, stateHome: '/data/state' })).toBe('/data/state/dck')
  })

  it('should fall back to the local state folder in the home when XDG is not set', () => {
    expect(defaultStateDir(base)).toBe('/home/u/.local/state/dck')
  })

  it('should use the application support folder when the platform is macOS', () => {
    const result = defaultStateDir({
      ...base,
      platform: 'darwin',
      home: '/Users/ana',
      stateHome: '/x',
    })

    expect(result).toBe('/Users/ana/Library/Application Support/dck')
  })

  it('should use the local app data when the platform is Windows', () => {
    const result = defaultStateDir({
      ...base,
      platform: 'win32',
      localAppData: 'C:\\Users\\u\\AppData\\Local',
    })

    expect(result).toContain('dck')
  })
})

describe('defaultConfigDir', () => {
  const base = {
    platform: 'linux' as const,
    home: '/home/ana',
    configHome: undefined,
    appData: undefined,
  }

  it('should use the XDG config home when it is set', () => {
    expect(defaultConfigDir({ ...base, configHome: '/data/config' })).toBe(
      '/data/config/dev-cockpit',
    )
  })

  it('should fall back to the config folder in the home when XDG is not set', () => {
    expect(defaultConfigDir(base)).toBe('/home/ana/.config/dev-cockpit')
  })

  it('should use the application support folder when the platform is macOS', () => {
    expect(defaultConfigDir({ ...base, platform: 'darwin' })).toBe(
      '/home/ana/Library/Application Support/Dev Cockpit',
    )
  })

  it('should use the roaming app data when the platform is Windows', () => {
    const result = defaultConfigDir({
      ...base,
      platform: 'win32',
      appData: 'C:\\Users\\ana\\AppData\\Roaming',
    })

    expect(result).toContain('Dev Cockpit')
  })
})

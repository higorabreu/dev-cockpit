import { describe, expect, it } from 'vitest'
import { defaultConfigDir, defaultEndpoint, defaultStateDir } from './endpoint.ts'

describe('defaultEndpoint', () => {
  it('should use the runtime directory when the platform provides one', () => {
    const result = defaultEndpoint({ platform: 'linux', runtimeDir: '/run/user/1000', uid: 1000 })

    expect(result).toBe('/run/user/1000/dck/daemon.sock')
  })

  it('should fall back to the temporary directory with the user id when there is no runtime directory', () => {
    const result = defaultEndpoint({ platform: 'darwin', runtimeDir: undefined, uid: 501 })

    expect(result).toMatch(/dck-501\/daemon\.sock$/)
  })

  it('should use a named pipe when the platform is Windows', () => {
    const result = defaultEndpoint({ platform: 'win32', runtimeDir: undefined, uid: undefined })

    expect(result).toBe('\\\\.\\pipe\\dck-daemon')
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
      '/data/config/Dev Cockpit',
    )
  })

  it('should fall back to the config folder in the home when XDG is not set', () => {
    expect(defaultConfigDir(base)).toBe('/home/ana/.config/Dev Cockpit')
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

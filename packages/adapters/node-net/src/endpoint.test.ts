import { describe, expect, it } from 'vitest'
import { defaultEndpoint } from './endpoint.ts'

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

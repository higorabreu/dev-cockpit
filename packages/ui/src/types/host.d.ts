import type { HostApi } from '@dck/core'

declare global {
  interface Window {
    dck: HostApi
  }
}

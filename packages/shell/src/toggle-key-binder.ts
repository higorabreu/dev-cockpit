import type { DesktopShortcut, GlobalShortcuts } from '@dck/core'

export interface ToggleKeyBinder {
  bind(key: string): Promise<boolean>
  release(): void
}

export interface ToggleKeyBinderDependencies {
  // Quando há, é o caminho principal: o sistema restaura a tecla a cada login
  readonly desktop?: DesktopShortcut
  readonly electron: GlobalShortcuts
  readonly onToggle: () => void
  readonly onInvalid: (key: string, error: unknown) => void
}

export function createToggleKeyBinder(dependencies: ToggleKeyBinderDependencies): ToggleKeyBinder {
  const { desktop, electron, onToggle, onInvalid } = dependencies
  let electronKey: string | undefined

  const registerElectron = (key: string) => {
    try {
      return electron.register(key, onToggle)
    } catch (error) {
      // Um acelerador malformado faz o Electron lançar em vez de devolver falso
      onInvalid(key, error)
      return false
    }
  }

  return {
    async bind(key) {
      if (desktop) {
        const bound = await desktop.bind(key)
        if (bound && electronKey) {
          electron.unregister(electronKey)
          electronKey = undefined
        }
        return bound
      }
      const previous = electronKey
      if (previous) electron.unregister(previous)
      if (registerElectron(key)) {
        electronKey = key
        return true
      }
      if (previous && registerElectron(previous)) electronKey = previous
      else electronKey = undefined
      return false
    },
    release() {
      if (electronKey) electron.unregister(electronKey)
      electronKey = undefined
    },
  }
}

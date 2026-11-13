import type { PlatformWindow } from '../platform-window.ts'

// A regular window activates the app on its own, so focus() alone gives it the keyboard
export function createRegularWindow(): PlatformWindow {
  return {
    options: {},
    place: (window) => window.setVisibleOnAllWorkspaces(true),
    dock: (window) => window,
  }
}

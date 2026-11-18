import { fontList, type Settings, type SystemFontsInfo, terminalFontStack } from '@dck/core'
import { tokens } from '@dck/design'

// The interface's fonts: a family the user chose goes before the cockpit's, which stay for what it lacks
export function applyAppearance(root: HTMLElement, appearance: Settings['appearance']) {
  const set = (variable: string, family: string | null, cockpit: string) => {
    if (family) root.style.setProperty(variable, `${fontList([family])}, ${cockpit}`)
    else root.style.removeProperty(variable)
  }
  set('--font-sans', appearance.fontFamily, tokens.font.sans)
  set('--font-mono', appearance.codeFontFamily, tokens.font.mono)
}

export interface TerminalLook {
  readonly fontFamily: string
  readonly cursorStyle: Settings['terminal']['cursorStyle']
  readonly cursorBlink: boolean
}

export function terminalLook(settings: Settings, system: SystemFontsInfo): TerminalLook {
  return {
    fontFamily: terminalFontStack(settings.terminal.fontFamily, system),
    cursorStyle: settings.terminal.cursorStyle,
    cursorBlink: settings.terminal.cursorBlink,
  }
}

// xterm measures its cells from the font on screen: a shipped font must be loaded before it does
export async function loadFont(size: number, family: string): Promise<void> {
  try {
    await document.fonts.load(`${size}px ${family}`)
  } catch {
    // An unknown family loads nothing; the list's next family draws instead
  }
}

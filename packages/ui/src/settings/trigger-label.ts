import { type HoldTrigger, type Keyboard, type Translate, triggerButton } from '@dck/core'

// The modifiers by the names each keyboard prints on them
const MODIFIERS: Readonly<Record<Keyboard, Readonly<Record<string, string>>>> = {
  pc: { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Super', OS: 'Super' },
  mac: { Control: 'Control', Alt: 'Option', Shift: 'Shift', Meta: 'Command', OS: 'Command' },
}

const NAMES: Readonly<Record<string, string>> = {
  CapsLock: 'Caps Lock',
  ScrollLock: 'Scroll Lock',
  NumLock: 'Num Lock',
  PrintScreen: 'Print Screen',
  ContextMenu: 'Menu',
}

// What a hold trigger is called on screen: "Right Ctrl", "F13", "Middle button"; a code with no name of
// its own reads as its words ("AudioVolumeUp" as "Audio Volume Up")
export function triggerLabel(code: HoldTrigger, keyboard: Keyboard, t: Translate): string {
  const button = triggerButton(code)
  if (button === 1) return t('settings.holdTrigger.middle')
  if (button === 3) return t('settings.holdTrigger.back')
  if (button === 4) return t('settings.holdTrigger.forward')
  if (button !== undefined) return t('settings.holdTrigger.button', { button })
  const sided = /^(Control|Alt|Shift|Meta|OS)(Left|Right)$/.exec(code)
  const name = sided?.[1] && MODIFIERS[keyboard][sided[1]]
  if (name)
    return t(sided[2] === 'Left' ? 'settings.holdTrigger.left' : 'settings.holdTrigger.right', {
      key: name,
    })
  return NAMES[code] ?? code.replace(/([a-z])([A-Z0-9])/g, '$1 $2')
}

export const isMouseTrigger = (code: HoldTrigger) => triggerButton(code) !== undefined

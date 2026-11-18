import { createTranslator } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { triggerLabel } from './trigger-label.ts'

describe('triggerLabel', () => {
  it('should name a modifier by its side as the keyboard prints it when the trigger is a modifier', () => {
    const t = createTranslator('en').t

    expect(triggerLabel('ControlRight', 'pc', t)).toBe('Right Ctrl')
    expect(triggerLabel('MetaRight', 'mac', t)).toBe('Right Command')
    expect(triggerLabel('ShiftLeft', 'pc', t)).toBe('Left Shift')
  })

  it('should name the side buttons and the lock keys when the trigger is one of them', () => {
    const t = createTranslator('en').t

    expect(triggerLabel('Mouse1', 'pc', t)).toBe('Middle button')
    expect(triggerLabel('Mouse4', 'pc', t)).toBe('Forward button')
    expect(triggerLabel('CapsLock', 'pc', t)).toBe('Caps Lock')
    expect(triggerLabel('F13', 'pc', t)).toBe('F13')
  })

  it('should name the Mac keys and the back button in Portuguese when the screen is in Portuguese', () => {
    // Arrange
    const t = createTranslator('pt-BR').t

    // Act
    const names = [
      triggerLabel('AltLeft', 'mac', t),
      triggerLabel('Mouse3', 'pc', t),
      triggerLabel('AudioVolumeUp', 'pc', t),
    ]

    // Assert
    expect(names).toEqual(['Option esquerdo', 'Botão voltar', 'Audio Volume Up'])
  })
})

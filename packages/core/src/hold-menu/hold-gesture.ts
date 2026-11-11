import type { Cancel, Scheduler } from '../ports/index.ts'

export interface HoldGestureOptions {
  readonly scheduler: Scheduler
  readonly openDelayMs?: number
  onOpen(): void
}

export interface HoldGesture {
  isHeld(): boolean
  isOpen(): boolean
  press(): void
  otherKey(): void
  // Verdadeiro quando a seta pertence ao menu; antes de abrir ela segue para o terminal
  arrow(): boolean
  openNow(): void
  // Verdadeiro quando o menu estava aberto, ou seja, quem chamou deve confirmar a escolha
  release(): boolean
  cancel(): void
}

const DEFAULT_OPEN_DELAY_MS = 180

export function createHoldGesture(options: HoldGestureOptions): HoldGesture {
  const delay = options.openDelayMs ?? DEFAULT_OPEN_DELAY_MS
  let held = false
  let interrupted = false
  let open = false
  let cancelTimer: Cancel | undefined

  function reset() {
    cancelTimer?.()
    cancelTimer = undefined
    held = false
    open = false
  }

  function openNow() {
    if (!held || open) return
    cancelTimer?.()
    open = true
    options.onOpen()
  }

  return {
    isHeld: () => held,
    isOpen: () => open,
    press() {
      reset()
      held = true
      interrupted = false
      cancelTimer = options.scheduler.after(delay, () => {
        if (!interrupted) openNow()
      })
    },
    otherKey() {
      if (held && !open) interrupted = true
    },
    arrow() {
      if (!held) return false
      if (!open) {
        interrupted = true
        return false
      }
      return true
    },
    openNow,
    release() {
      const wasOpen = open
      reset()
      return wasOpen
    },
    cancel: reset,
  }
}

import type { Cancel, Scheduler } from '../ports/index.ts'

export interface HoldGestureOptions {
  readonly scheduler: Scheduler
  readonly openDelayMs?: number
  onOpen(): void
}

// What a mouse trigger's release asks of the menu: run the selected row, close, or stay open for a pick
export type ButtonRelease = 'run' | 'close' | 'stay'

export interface HoldGesture {
  isHeld(): boolean
  isOpen(): boolean
  // Open after a quick click of a mouse trigger, until a pick, Esc, a click off it or the button again
  isSticky(): boolean
  // False when the press closed a menu that stayed open, so there is nothing to hold
  press(): boolean
  otherKey(): void
  // True when the arrow belongs to the menu; before it opens the arrow goes on to the terminal
  arrow(): boolean
  openNow(): void
  // A key trigger: true when the menu was open, meaning the caller must confirm the choice
  release(): boolean
  // A mouse trigger: some mice (many Logitech ones) send press and release together whatever the hold,
  // so a release before the menu opened keeps it open instead of dropping it
  releaseButton(): ButtonRelease
  cancel(): void
}

const DEFAULT_OPEN_DELAY_MS = 180

export function createHoldGesture(options: HoldGestureOptions): HoldGesture {
  const delay = options.openDelayMs ?? DEFAULT_OPEN_DELAY_MS
  let held = false
  let interrupted = false
  let open = false
  let sticky = false
  let cancelTimer: Cancel | undefined

  function reset() {
    cancelTimer?.()
    cancelTimer = undefined
    held = false
    open = false
    sticky = false
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
    isSticky: () => sticky,
    press() {
      const closing = sticky
      reset()
      if (closing) return false
      held = true
      interrupted = false
      cancelTimer = options.scheduler.after(delay, () => {
        if (!interrupted) openNow()
      })
      return true
    },
    otherKey() {
      if (held && !open) interrupted = true
    },
    arrow() {
      if (sticky) return true
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
    releaseButton() {
      if (held && open) {
        reset()
        return 'run'
      }
      if (!held || interrupted) {
        reset()
        return 'close'
      }
      cancelTimer?.()
      cancelTimer = undefined
      held = false
      open = true
      sticky = true
      options.onOpen()
      return 'stay'
    },
    cancel: reset,
  }
}

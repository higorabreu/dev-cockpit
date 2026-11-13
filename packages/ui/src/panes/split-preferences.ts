import type { Orientation, Settings, SettingsPatch, SplitPreference } from '@dck/core'
import type { SplitPreferences } from './tab-view.ts'

// A drag or a held arrow key moves the divider many times a second; the share is saved once it rests
export const RATIO_SAVE_MS = 400

export interface SplitPreferencesDeps {
  current(): Settings
  update(patch: SettingsPatch): unknown
  // Runs `task` after `milliseconds`; returns a way to cancel it
  after(milliseconds: number, task: () => void): () => void
}

const RATIO_KEY = { side: 'sideRatio', stacked: 'stackedRatio' } as const

// The review's layout and divider shares, kept in settings; a share waiting to be saved already counts
export function createSplitPreferences(deps: SplitPreferencesDeps) {
  const pending = new Map<Orientation, number>()
  let cancel: (() => void) | undefined

  function save() {
    cancel = undefined
    const review: Record<string, number> = {}
    for (const [orientation, ratio] of pending) review[RATIO_KEY[orientation]] = ratio
    pending.clear()
    deps.update({ review })
  }

  return {
    current(): SplitPreferences {
      const { review } = deps.current()
      return {
        preference: review.layout,
        ratios: {
          side: pending.get('side') ?? review.sideRatio,
          stacked: pending.get('stacked') ?? review.stackedRatio,
        },
      }
    },
    saveRatio(orientation: Orientation, ratio: number) {
      pending.set(orientation, ratio)
      cancel?.()
      cancel = deps.after(RATIO_SAVE_MS, save)
    },
    setPreference(preference: SplitPreference) {
      if (deps.current().review.layout !== preference)
        deps.update({ review: { layout: preference } })
    },
  }
}

export type SplitPreferencesStore = ReturnType<typeof createSplitPreferences>

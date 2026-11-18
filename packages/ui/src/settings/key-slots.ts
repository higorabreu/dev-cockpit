import {
  type Chord,
  chordTrigger,
  formatChord,
  type HoldTrigger,
  parseChord,
  type SettingsPatch,
  SHORTCUT_IDS,
  type ShortcutId,
  sameChord,
  shortcutKeysPatch,
  triggerChord,
} from '@dck/core'
import type { Keymap } from '../platform/keymap.ts'

// What holds a key on the Shortcuts page: an interface action, the global key or the hold menu trigger
export type KeySlot = ShortcutId | 'toggleWindow' | 'holdTrigger'

export const KEY_SLOTS: readonly KeySlot[] = [...SHORTCUT_IDS, 'toggleWindow', 'holdTrigger']

// A value as its slot keeps it: a chord for an action, Electron's text for the global key, a code for
// the trigger
export type SlotValue =
  | { readonly kind: 'chord'; readonly chord: Chord }
  | { readonly kind: 'accelerator'; readonly text: string }
  | { readonly kind: 'trigger'; readonly code: HoldTrigger }

export interface KeySlots {
  readonly keymap: Keymap
  readonly toggleWindow: string
  // The trigger in use, the keyboard's own when the user chose none
  readonly holdTrigger: HoldTrigger
}

// The chord a value makes inside the window: what two slots can share
function chordOf(value: SlotValue): Chord | undefined {
  if (value.kind === 'chord') return value.chord
  if (value.kind === 'accelerator') return parseChord(value.text)
  return triggerChord(value.code)
}

// The value a slot holds now; an action gives its first chord, the one its label shows
export function slotValue(slots: KeySlots, slot: KeySlot): SlotValue {
  if (slot === 'toggleWindow') return { kind: 'accelerator', text: slots.toggleWindow }
  if (slot === 'holdTrigger') return { kind: 'trigger', code: slots.holdTrigger }
  const [chord] = slots.keymap.chords(slot)
  if (!chord) throw new Error(`invariant: ${slot} has a chord`)
  return { kind: 'chord', chord }
}

function holds(slots: KeySlots, slot: KeySlot, chord: Chord): boolean {
  if (slot === 'toggleWindow' || slot === 'holdTrigger') {
    const own = chordOf(slotValue(slots, slot))
    return own !== undefined && sameChord(own, chord)
  }
  return slots.keymap.chords(slot).some((own) => sameChord(own, chord))
}

// The value in the form another slot keeps, or undefined when that slot cannot take it: the trigger is one
// key with no modifier
function convert(value: SlotValue, slot: KeySlot): SlotValue | undefined {
  const chord = chordOf(value)
  if (slot === 'holdTrigger') {
    if (value.kind === 'trigger') return value
    const code = chord && chordTrigger(chord)
    return code ? { kind: 'trigger', code } : undefined
  }
  if (slot === 'toggleWindow') {
    if (value.kind === 'accelerator') return value
    return chord ? { kind: 'accelerator', text: formatChord(chord, 'pc') } : undefined
  }
  return chord ? { kind: 'chord', chord } : undefined
}

// What to save so a slot holds a value. A default of the slot is saved as no choice, so settings.json
// keeps only what the user changed and the action gets all its default chords back
function patchFor(slots: KeySlots, slot: KeySlot, value: SlotValue): SettingsPatch {
  if (value.kind === 'accelerator') return { shortcuts: { toggleWindow: value.text } }
  if (value.kind === 'trigger') {
    const own = value.code === slots.keymap.holdTrigger ? null : value.code
    return { shortcuts: { holdTrigger: own } }
  }
  if (slot === 'toggleWindow' || slot === 'holdTrigger')
    throw new Error(`invariant: a chord goes to an action, not ${slot}`)
  const isDefault = slots.keymap.defaults(slot).some((chord) => sameChord(chord, value.chord))
  return shortcutKeysPatch({ [slot]: isDefault ? null : slots.keymap.chordText(value.chord) })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function mergePatches(a: unknown, b: unknown): unknown {
  if (!isRecord(a) || !isRecord(b)) return b
  const merged: Record<string, unknown> = { ...a }
  for (const [key, value] of Object.entries(b)) merged[key] = mergePatches(a[key], value)
  return merged
}

export type Placement =
  // The slot holds it already
  | { readonly kind: 'same' }
  | { readonly kind: 'save'; readonly patch: SettingsPatch }
  // Another slot holds it; `swap` also gives that slot this one's value, when it can take it
  | { readonly kind: 'conflict'; readonly owner: KeySlot; readonly swap?: SettingsPatch }

// Where a recorded value goes: saved, or held back because another slot answers to the same key
export function place(slots: KeySlots, slot: KeySlot, value: SlotValue): Placement {
  const chord = chordOf(value)
  const current = slotValue(slots, slot)
  const same =
    value.kind === 'trigger' && current.kind === 'trigger'
      ? value.code === current.code
      : chord !== undefined && holds(slots, slot, chord)
  if (same) return { kind: 'same' }
  const patch = patchFor(slots, slot, value)
  const owner = chord && KEY_SLOTS.find((other) => other !== slot && holds(slots, other, chord))
  if (!owner) return { kind: 'save', patch }
  const previous = convert(current, owner)
  if (!previous) return { kind: 'conflict', owner }
  const swap = mergePatches(patch, patchFor(slots, owner, previous)) as SettingsPatch
  return { kind: 'conflict', owner, swap }
}

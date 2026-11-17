// How far the pointer travels before it takes the selection from the keys, in CSS pixels
const TRAVEL = 6

// The wheel opens wherever the pointer rests, and redrawing it makes the browser report the pointer over
// the new sector: the keys lead until the pointer really moves, and lead again from the next key
export function createPointerIntent(travel = TRAVEL) {
  let keysLead = true
  let anchor: { x: number; y: number } | undefined
  return {
    keysTakeOver() {
      keysLead = true
      anchor = undefined
    },
    // True when a pointer move at x, y should select what is under the pointer
    moved(x: number, y: number): boolean {
      if (!keysLead) return true
      if (!anchor) {
        anchor = { x, y }
        return false
      }
      if (Math.hypot(x - anchor.x, y - anchor.y) < travel) return false
      keysLead = false
      return true
    },
  }
}

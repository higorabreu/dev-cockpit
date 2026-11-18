import { keepListed, markSeen, type SeenMarks, seenViewsSchema, type ViewItem } from '@dck/core'

const STORAGE_KEY = 'dck-seen-v1'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

const same = (a: SeenMarks, b: SeenMarks) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([id, updatedAt]) => b[id] === updatedAt)

// What the user saw of each view that feeds the attention count, per machine: view id -> item id -> updatedAt
export function createSeenMarks(storage: Storage) {
  const marks = new Map<string, SeenMarks>(Object.entries(load()))

  function load(): Record<string, SeenMarks> {
    try {
      const parsed = seenViewsSchema.safeParse(JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null'))
      return parsed.success ? parsed.data : {}
    } catch {
      return {}
    }
  }

  function save() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(marks)))
    } catch {
      // without storage, the marks only last for this run
    }
  }

  // Saves only a change, so a redraw of the same list writes nothing
  function put(view: string, next: SeenMarks): boolean {
    if (same(marks.get(view) ?? {}, next)) return false
    marks.set(view, next)
    save()
    return true
  }

  return {
    of: (view: string): SeenMarks => marks.get(view) ?? {},
    // The user has the list in front of them: every item is seen at its current version
    see: (view: string, items: readonly ViewItem[]) => put(view, markSeen(items)),
    // A fresh list: the marks of items that left it go away
    keep: (view: string, items: readonly ViewItem[]) =>
      put(view, keepListed(marks.get(view) ?? {}, items)),
  }
}

export type SeenMarksStore = ReturnType<typeof createSeenMarks>

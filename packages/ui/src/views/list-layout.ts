import type { IssueStatusCategory, ViewItem } from '@dck/core'

export const ROW_HEIGHT = 46
export const HEADER_HEIGHT = 32

// Items under an optional heading; a list of merge requests is one group without one
export interface ListGroup {
  readonly category: IssueStatusCategory | undefined
  readonly items: readonly ViewItem[]
}

export interface LaidSection {
  readonly category: IssueStatusCategory | undefined
  // The items of the section, as indexes of the whole list [start, end)
  readonly start: number
  readonly end: number
  readonly top: number
  readonly height: number
}

export type LaidEntry =
  | { readonly kind: 'header'; readonly section: number; readonly top: number }
  | { readonly kind: 'row'; readonly index: number; readonly section: number; readonly top: number }

export interface ListLayout {
  readonly items: readonly ViewItem[]
  readonly sections: readonly LaidSection[]
  // Headers and rows in drawing order, with where each starts
  readonly entries: readonly LaidEntry[]
  readonly tops: readonly number[]
  readonly height: number
}

// Items are numbered across the groups, so the selection and the screen reader's position count only them
export function layOutList(groups: readonly ListGroup[]): ListLayout {
  const entries: LaidEntry[] = []
  let top = 0
  let index = 0
  const sections = groups.map((group, section): LaidSection => {
    const start = index
    const sectionTop = top
    if (group.category !== undefined) {
      entries.push({ kind: 'header', section, top })
      top += HEADER_HEIGHT
    }
    for (const _item of group.items) {
      entries.push({ kind: 'row', index, section, top })
      top += ROW_HEIGHT
      index += 1
    }
    return {
      category: group.category,
      start,
      end: index,
      top: sectionTop,
      height: top - sectionTop,
    }
  })
  return {
    items: groups.flatMap((group) => group.items),
    sections,
    entries,
    tops: entries.map((entry) => entry.top),
    height: top,
  }
}

// Where a row starts and ends on screen; the first row of a section brings its header into view with it
export function rowSpan(layout: ListLayout, index: number): { top: number; bottom: number } {
  const section = layout.sections.find((entry) => index >= entry.start && index < entry.end)
  if (section === undefined) return { top: 0, bottom: 0 }
  const header = section.category === undefined ? 0 : HEADER_HEIGHT
  const top = section.top + header + (index - section.start) * ROW_HEIGHT
  return { top: index === section.start ? section.top : top, bottom: top + ROW_HEIGHT }
}

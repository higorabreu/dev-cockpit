import type { ViewItem } from '../ports/views.ts'

// Case and accents do not count, so a word typed without its accents still finds it
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const WORD_CHAR = /[\p{L}\p{N}]/u

// A word starts the text, follows a separator or is one, so "39" finds NTF-397 and "!41" a reference
function startsAWord(text: string, word: string): boolean {
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    if (at === 0 || !WORD_CHAR.test(text.charAt(at - 1)) || !WORD_CHAR.test(text.charAt(at))) {
      return true
    }
  }
  return false
}

// What people type to name one item: a task's key, a merge request's reference with or without its project
const referencesOf = (item: ViewItem): readonly string[] =>
  item.kind === 'issue' ? [item.key] : [`${item.project}!${item.number}`, `!${item.number}`]

const searchText = (item: ViewItem) =>
  item.kind === 'mergeRequest'
    ? [`${item.project}!${item.number}`, item.title, item.author, item.sourceBranch].join(' ')
    : [item.key, item.summary, item.type, item.status, item.project].join(' ')

function rank(item: ViewItem, needle: string): number {
  const references = referencesOf(item).map(fold)
  if (references.includes(needle)) return 0
  if (references.some((reference) => reference.startsWith(needle))) return 1
  return 2
}

// Whether the query is the item's key or reference, or the start of one
export function matchesReference(item: ViewItem, query: string): boolean {
  const needle = fold(query.trim()).split(/\s+/).join(' ')
  return needle !== '' && rank(item, needle) < 2
}

// Every typed word must start a word of the item; the exact key or reference comes first, then a key that
// starts with the query, then the rest in the list's own order. Without a query the list is kept as it is
export function searchViewItems(items: readonly ViewItem[], query: string): readonly ViewItem[] {
  const words = fold(query)
    .split(/\s+/)
    .filter((word) => word !== '')
  if (words.length === 0) return items
  const needle = words.join(' ')
  return items
    .map((item, order) => ({ item, order, text: fold(searchText(item)) }))
    .filter((entry) => words.every((word) => startsAWord(entry.text, word)))
    .map((entry) => ({ ...entry, rank: rank(entry.item, needle) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((entry) => entry.item)
}

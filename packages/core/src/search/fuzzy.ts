const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const WORD_START = /[\s/_.-]/

// Scores the text against the query; undefined when the letters do not appear in order
export function fuzzyScore(query: string, text: string): number | undefined {
  const needle = normalize(query).replace(/\s+/g, '')
  const haystack = normalize(text)
  if (needle === '') return 0
  const substring = haystack.indexOf(needle)
  let score = substring === -1 ? 0 : 100 - substring
  let at = 0
  let previous = -2
  for (const char of needle) {
    const found = haystack.indexOf(char, at)
    if (found === -1) return undefined
    score += 1
    if (found === previous + 1) score += 2
    if (found === 0 || WORD_START.test(haystack.charAt(found - 1))) score += 3
    previous = found
    at = found + 1
  }
  return score
}

// Without a query keeps the given order (recency); with a query sorts by score, breaking ties by the given order
export function searchItems<T>(
  items: readonly T[],
  query: string,
  textOf: (item: T) => string,
): readonly T[] {
  if (query.trim() === '') return items
  return items
    .map((item, order) => ({ item, order, score: fuzzyScore(query, textOf(item)) }))
    .flatMap((entry) => (entry.score === undefined ? [] : [{ ...entry, score: entry.score }]))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.item)
}

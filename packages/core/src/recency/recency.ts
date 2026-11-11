export function recordInteraction(
  recent: readonly string[],
  id: string,
  max = 50,
): readonly string[] {
  return [id, ...recent.filter((entry) => entry !== id)].slice(0, max)
}

export function orderByRecency(
  known: readonly string[],
  recent: readonly string[],
): readonly string[] {
  const knownIds = new Set(known)
  const recentKnown = [...new Set(recent)].filter((id) => knownIds.has(id))
  const recentIds = new Set(recentKnown)
  return [...recentKnown, ...known.filter((id) => !recentIds.has(id))]
}

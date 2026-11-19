// A fuzzy scorer of the kind the file search needs, to time it on 100 000 paths: the query's letters in
// order, scored higher at word starts, in contiguous runs and in the file's name, and for shorter paths.
const SEPARATORS = new Set(['/', '\\', '_', '-', '.', ' '])

function isWordStart(path, lower, index) {
  if (index === 0) return true
  const before = path[index - 1]
  if (SEPARATORS.has(before)) return true
  // camelCase: a capital after a lower case letter
  return path[index] !== lower[index] && before === lower[index - 1]
}

// Score of the query as a subsequence of lower[from..], or -1; greedy with a bonus per run and start
function scoreFrom(query, path, lower, from) {
  let score = 0
  let run = 0
  let at = from
  for (let q = 0; q < query.length; q++) {
    const found = lower.indexOf(query[q], at)
    if (found < 0) return -1
    if (found === at && q > 0) run++
    else run = 0
    score += 1 + run * 4 + (isWordStart(path, lower, found) ? 6 : 0)
    if (found === from && q === 0) score += 4
    at = found + 1
  }
  return score
}

export function createIndex(paths) {
  const lower = paths.map((path) => path.toLowerCase())
  const names = paths.map((path) => path.lastIndexOf('/') + 1)
  return { paths, lower, names }
}

// The best `limit` paths for the query: the name first (a match there scores double), else the whole path.
// `within` limits the search to earlier matches; `matched` lists every path that matched
export function rank(index, query, limit = 50, within = undefined) {
  const needle = query.toLowerCase()
  const best = []
  const matched = []
  let floor = Number.NEGATIVE_INFINITY
  const count = within ? within.length : index.paths.length
  for (let k = 0; k < count; k++) {
    const i = within ? within[k] : k
    const lower = index.lower[i]
    const path = index.paths[i]
    const inName = scoreFrom(needle, path, lower, index.names[i])
    const raw = inName >= 0 ? inName * 2 : scoreFrom(needle, path, lower, 0)
    if (raw < 0) continue
    matched.push(i)
    const score = raw - path.length * 0.01
    if (score <= floor) continue
    let at = best.length
    while (at > 0 && best[at - 1].score < score) at--
    best.splice(at, 0, { score, path })
    if (best.length > limit) best.pop()
    if (best.length === limit) floor = best[limit - 1].score
  }
  return { best, matched }
}

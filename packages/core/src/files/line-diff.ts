// Lines [aStart, aEnd) of the first text became lines [bStart, bEnd) of the second; an empty range is an
// insertion or a deletion at that point
export interface Hunk {
  readonly aStart: number
  readonly aEnd: number
  readonly bStart: number
  readonly bEnd: number
}

// Each line with its own line break, so a last line without one differs from the same line with one, as
// in git
export const splitLines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? []

// Myers' shortest edit script over a[a0, a0 + n) and b[b0, b0 + m): the pairs of equal lines it keeps, in
// order, or undefined past `limit` inserted plus deleted lines
function keptPairs(
  a: readonly string[],
  b: readonly string[],
  a0: number,
  b0: number,
  n: number,
  m: number,
  limit: number,
): [number, number][] | undefined {
  const max = Math.min(n + m, limit)
  const offset = max + 1
  // The furthest x reached on each diagonal k = x - y, at index k + offset
  const furthest = new Int32Array(2 * max + 3)
  const reach = (k: number) => furthest[offset + k] ?? 0
  const trace: Int32Array[] = []
  let edits = -1
  for (let d = 0; d <= max && edits < 0; d++) {
    trace.push(furthest.slice(offset - d, offset + d + 1))
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && reach(k - 1) < reach(k + 1))
      let x = down ? reach(k + 1) : reach(k - 1) + 1
      let y = x - k
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) {
        x++
        y++
      }
      furthest[offset + k] = x
      if (x >= n && y >= m) {
        edits = d
        break
      }
    }
  }
  if (edits < 0) return undefined
  const pairs: [number, number][] = []
  let x = n
  let y = m
  for (let d = edits; d > 0; d--) {
    // The furthest x of each diagonal before step d, at index k + d
    const before = trace[d] ?? new Int32Array(0)
    const at = (k: number) => before[k + d] ?? 0
    const k = x - y
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1))
    const previousK = down ? k + 1 : k - 1
    const previousX = at(previousK)
    // Where the step's insertion (down) or deletion (right) landed, before the equal lines after it
    const stepX = down ? previousX : previousX + 1
    while (x > stepX) {
      x--
      y--
      pairs.push([a0 + x, b0 + y])
    }
    x = previousX
    y = previousX - previousK
  }
  while (x > 0) {
    x--
    y--
    pairs.push([a0 + x, b0 + y])
  }
  return pairs.reverse()
}

// The changed regions from a to b, or undefined when more than `limit` lines were inserted or deleted
export function diffLines(
  a: readonly string[],
  b: readonly string[],
  limit: number,
): readonly Hunk[] | undefined {
  // Edits are usually in one place: the common start and end never enter the quadratic part
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let aEnd = a.length
  let bEnd = b.length
  while (aEnd > start && bEnd > start && a[aEnd - 1] === b[bEnd - 1]) {
    aEnd--
    bEnd--
  }
  const pairs = keptPairs(a, b, start, start, aEnd - start, bEnd - start, limit)
  if (pairs === undefined) return undefined
  const hunks: Hunk[] = []
  let x = start
  let y = start
  for (const [keptX, keptY] of [...pairs, [aEnd, bEnd] as const]) {
    if (keptX > x || keptY > y) hunks.push({ aStart: x, aEnd: keptX, bStart: y, bEnd: keptY })
    x = keptX + 1
    y = keptY + 1
  }
  return hunks
}

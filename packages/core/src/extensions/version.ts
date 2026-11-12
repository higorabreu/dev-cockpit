type Triple = readonly [number, number, number]

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/
const COMPARATOR = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/

export const isVersion = (text: string): boolean => VERSION.test(text)

// A pre-release suffix is ignored when comparing, so 1.2.0-beta counts as 1.2.0
function parse(text: string): Triple | undefined {
  const match = VERSION.exec(text)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined
}

const comparators = (range: string) => range.trim().split(/\s+/)

// A range is space separated comparators that must all hold, for example ">=0.3.0 <1.0.0"
export const isVersionRange = (range: string): boolean =>
  comparators(range).every((part) => COMPARATOR.test(part))

const compare = (a: Triple, b: Triple) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

export function satisfies(version: string, range: string): boolean {
  const current = parse(version)
  if (current === undefined) return false
  return comparators(range).every((part) => {
    const match = COMPARATOR.exec(part)
    const target = match ? parse(match[2] ?? '') : undefined
    if (target === undefined) return false
    const order = compare(current, target)
    switch (match?.[1] ?? '=') {
      case '>=':
        return order >= 0
      case '<=':
        return order <= 0
      case '>':
        return order > 0
      case '<':
        return order < 0
      default:
        return order === 0
    }
  })
}

export type TokenScale = { readonly unit: 'raw' | 'thousand' | 'million'; readonly value: number }

// 639726 vira 640 mil; 1.2 milhão fica com uma casa decimal
export function tokenScale(count: number): TokenScale {
  if (count < 1000) return { unit: 'raw', value: count }
  if (count < 1_000_000) return { unit: 'thousand', value: Math.round(count / 1000) }
  return { unit: 'million', value: Math.round(count / 100_000) / 10 }
}

export function contextPercentage(tokens: number, window: number): number | undefined {
  if (window <= 0) return undefined
  return Math.min(100, Math.round((tokens / window) * 100))
}

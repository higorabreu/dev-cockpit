// Past this a badge reads "9+": the pill keeps one size and the exact count goes in the tooltip
export const BADGE_MAX = 9

// The text of a rail badge, or nothing when there is nothing to count
export function formatBadge(count: number): string | undefined {
  if (count <= 0) return undefined
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count)
}

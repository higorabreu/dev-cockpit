const PREVIEW_MAX = 60

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// A pasted blob must not stretch the screen: objects fold and long texts are cut
export function previewValue(value: unknown): string {
  const text = isRecord(value)
    ? Object.keys(value).length === 0
      ? '{}'
      : '{…}'
    : (JSON.stringify(value) ?? String(value))
  return text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text
}

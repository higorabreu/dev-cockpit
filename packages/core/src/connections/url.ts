// Accepts the address with or without /api/v4 and with a trailing slash
export function normalizeBaseUrl(input: string): string {
  return input
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v4$/, '')
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// Returns the normalized address, or undefined when unusable: the token travels with it, so https only
// (http only on the local machine) and no user, query or fragment
export function parseServerUrl(input: string): string | undefined {
  const normalized = normalizeBaseUrl(input)
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    return undefined
  }
  const secure =
    url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))
  if (!secure || url.username || url.password || url.search || url.hash) return undefined
  return normalized
}

// Aceita o endereço com ou sem /api/v4 e com barra no fim
export function normalizeBaseUrl(input: string): string {
  return input
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v4$/, '')
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// Devolve o endereço normalizado, ou undefined quando não serve: o token viaja nele, então só https
// (http apenas na própria máquina) e sem usuário, consulta ou fragmento
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

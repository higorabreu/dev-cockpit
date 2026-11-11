const storageKey = 'dck-recent-projects'

// Provisório: a recência persistente de projetos entra com o registro do M1-T7
export function loadRecentProjects(): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : []
  } catch {
    return []
  }
}

export function saveRecentProjects(paths: readonly string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(paths))
  } catch {
    // sem armazenamento, a ordem só vale nesta execução
  }
}

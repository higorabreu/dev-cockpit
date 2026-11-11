import type { Project } from '../ports/projects.ts'

// Fixados primeiro (entre si, na ordem de uso recente e depois por nome), depois os abertos
// recentemente, depois o resto pela atividade do repositório
export function rankProjects(
  projects: readonly Project[],
  recent: readonly string[],
  favorites: readonly string[] = [],
): readonly Project[] {
  const pinned = new Set(favorites)
  const marked = projects.map((project) =>
    pinned.has(project.path) ? { ...project, favorite: true } : project,
  )
  const byPath = new Map(marked.map((project) => [project.path, project]))
  const opened = recent.flatMap((path) => byPath.get(path) ?? [])
  const openedPaths = new Set(opened.map((project) => project.path))
  const rest = marked
    .filter((project) => !openedPaths.has(project.path))
    .sort((a, b) => (b.activity ?? 0) - (a.activity ?? 0) || a.name.localeCompare(b.name))
  const ordered = [...opened, ...rest]
  return [
    ...ordered.filter((project) => project.favorite),
    ...ordered.filter((project) => !project.favorite),
  ]
}

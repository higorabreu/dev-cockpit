import type { Project } from '../ports/projects.ts'

export function rankProjects(
  projects: readonly Project[],
  recent: readonly string[],
): readonly Project[] {
  const byPath = new Map(projects.map((project) => [project.path, project]))
  const opened = recent.flatMap((path) => byPath.get(path) ?? [])
  const openedPaths = new Set(opened.map((project) => project.path))
  const rest = projects
    .filter((project) => !openedPaths.has(project.path))
    .sort((a, b) => (b.activity ?? 0) - (a.activity ?? 0) || a.name.localeCompare(b.name))
  return [...opened, ...rest]
}

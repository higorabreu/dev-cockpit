// The pages the About page links to; the window names one and the host builds its address
export const ABOUT_LINKS = ['repository', 'releaseNotes', 'issue', 'license'] as const

export type AboutLink = (typeof ABOUT_LINKS)[number]

// Each on the cockpit's own repository: the release notes of the version that runs, a blank new issue
export function aboutUrl(repository: string, version: string, link: AboutLink): string {
  const base = `https://github.com/${repository}`
  if (link === 'releaseNotes') return `${base}/releases/tag/v${version}`
  if (link === 'issue') return `${base}/issues/new`
  if (link === 'license') return `${base}/blob/main/LICENSE`
  return base
}

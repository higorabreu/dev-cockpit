import {
  errorBody,
  fail,
  type HttpClient,
  isStable,
  ok,
  parseSemver,
  type Release,
  type ReleaseSource,
} from '@dck/core'
import { z } from 'zod'

// Pinned so a change to the API's default shape does not reach the schema unannounced
const API_VERSION = '2022-11-28'
const MAX_ASSETS = 100

const releaseSchema = z.object({
  tag_name: z.string().min(1).max(100),
  html_url: z.string().max(2048),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        browser_download_url: z.string().max(2048),
        size: z.number().int().nonnegative(),
      }),
    )
    .max(MAX_ASSETS),
})

export interface ReleaseSourceOptions {
  readonly http: HttpClient
  // owner/name
  readonly repository: string
  // The running version, sent in the User-Agent and nothing else about the user
  readonly appVersion: string
  // https://api.github.com; a local feed replaces both roots in a development check
  readonly apiRoot?: string
  // https://github.com: the release page and its files must be under the repository's releases there
  readonly webRoot?: string
}

// A link the answer gives is only kept under the repository's own releases, so a bad answer cannot send
// the download or the browser anywhere else
function underReleases(text: string, prefix: string): string | undefined {
  const url = URL.parse(text)
  return url && url.href.startsWith(prefix) && url.username === '' && url.password === ''
    ? url.href
    : undefined
}

// The public `releases/latest` endpoint, which needs no token: no account or data of the user is sent
export function createGitHubReleaseSource(options: ReleaseSourceOptions): ReleaseSource {
  const apiRoot = options.apiRoot ?? 'https://api.github.com'
  const prefix = `${options.webRoot ?? 'https://github.com'}/${options.repository}/releases/`
  const url = `${apiRoot}/repos/${options.repository}/releases/latest`
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': API_VERSION,
    'user-agent': `dev-cockpit/${options.appVersion}`,
  }

  return {
    async latest() {
      const response = await options.http.get({ url, headers })
      if (!response.ok) return fail(errorBody('DCK-UPD-001', response.error.message))
      const { status, body } = response.value
      // No release published yet
      if (status === 404) return ok(undefined)
      if (status >= 400) return fail(errorBody('DCK-UPD-001', `HTTP ${status}`))
      let json: unknown
      try {
        json = JSON.parse(body)
      } catch {
        return fail(errorBody('DCK-UPD-002', 'invalid JSON'))
      }
      const parsed = releaseSchema.safeParse(json)
      if (!parsed.success) return fail(errorBody('DCK-UPD-002', 'release shape'))
      const { tag_name, html_url, draft, prerelease, assets } = parsed.data
      const version = parseSemver(tag_name)
      // The endpoint already leaves these out; a stable tag on a prerelease is still skipped
      if (draft || prerelease || !version || !isStable(version)) return ok(undefined)
      const page = underReleases(html_url, prefix)
      if (!page) return fail(errorBody('DCK-UPD-002', 'release page outside the repository'))
      const files = assets.flatMap((asset) => {
        const link = underReleases(asset.browser_download_url, prefix)
        return link ? [{ name: asset.name, url: link, size: asset.size }] : []
      })
      const release: Release = {
        version: `${version.major}.${version.minor}.${version.patch}`,
        page,
        assets: files,
      }
      return ok(release)
    },
  }
}

import {
  errorBody,
  fail,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
  ok,
  type Result,
} from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createGitHubReleaseSource } from './release-source.ts'

const RELEASES = 'https://github.com/acme/backend/releases'

function fakeHttp(reply: HttpResponse | 'network') {
  const requests: HttpRequest[] = []
  const http: HttpClient = {
    async get(request) {
      requests.push(request)
      return reply === 'network' ? fail(errorBody('DCK-NET-001', 'offline')) : ok(reply)
    },
  }
  return { http, requests }
}

const json = (value: unknown, status = 200): HttpResponse => ({
  status,
  headers: {},
  body: JSON.stringify(value),
})

const release = (extra: Record<string, unknown> = {}) => ({
  tag_name: 'v0.10.0',
  html_url: `${RELEASES}/tag/v0.10.0`,
  draft: false,
  prerelease: false,
  assets: [
    {
      name: 'dev-cockpit_0.10.0_amd64.deb',
      browser_download_url: `${RELEASES}/download/v0.10.0/dev-cockpit_0.10.0_amd64.deb`,
      size: 1000,
    },
    {
      name: 'SHA256SUMS',
      browser_download_url: `${RELEASES}/download/v0.10.0/SHA256SUMS`,
      size: 200,
    },
  ],
  ...extra,
})

const source = (reply: HttpResponse | 'network') => {
  const fake = fakeHttp(reply)
  return {
    ...fake,
    source: createGitHubReleaseSource({
      http: fake.http,
      repository: 'acme/backend',
      appVersion: '0.9.0',
    }),
  }
}

const codeOf = (result: Result<unknown, { data?: { code?: string } }>) =>
  result.ok ? undefined : result.error.data?.code

describe('createGitHubReleaseSource', () => {
  it('should read the version, the page and the files when the latest release is stable', async () => {
    const { source: releases } = source(json(release()))

    const result = await releases.latest()

    expect(result).toEqual({
      ok: true,
      value: {
        version: '0.10.0',
        page: `${RELEASES}/tag/v0.10.0`,
        assets: [
          {
            name: 'dev-cockpit_0.10.0_amd64.deb',
            url: `${RELEASES}/download/v0.10.0/dev-cockpit_0.10.0_amd64.deb`,
            size: 1000,
          },
          { name: 'SHA256SUMS', url: `${RELEASES}/download/v0.10.0/SHA256SUMS`, size: 200 },
        ],
      },
    })
  })

  it('should ask the public endpoint with no token and only the version as user agent', async () => {
    const { source: releases, requests } = source(json(release()))

    await releases.latest()

    expect(requests[0]?.url).toBe('https://api.github.com/repos/acme/backend/releases/latest')
    expect(requests[0]?.headers?.['user-agent']).toBe('dev-cockpit/0.9.0')
    expect(Object.keys(requests[0]?.headers ?? {})).not.toContain('authorization')
  })

  it.each([
    ['a draft', { draft: true }],
    ['a prerelease', { prerelease: true }],
    ['a prerelease tag', { tag_name: 'v0.10.0-rc.1' }],
    ['a tag that is not a version', { tag_name: 'nightly' }],
  ])('should offer nothing when the release is %s', async (_name, extra) => {
    const { source: releases } = source(json(release(extra)))

    expect(await releases.latest()).toEqual({ ok: true, value: undefined })
  })

  it('should offer nothing when no release is published', async () => {
    const { source: releases } = source(json({ message: 'Not Found' }, 404))

    expect(await releases.latest()).toEqual({ ok: true, value: undefined })
  })

  it('should drop a file when its link leaves the repository releases', async () => {
    const outside = {
      name: 'dev-cockpit_0.10.0_arm64.deb',
      browser_download_url: 'https://downloads.example.com/dev-cockpit_0.10.0_arm64.deb',
      size: 1,
    }
    const { source: releases } = source(json(release({ assets: [outside] })))

    const result = await releases.latest()

    expect(result.ok && result.value?.assets).toEqual([])
  })

  it('should fail as unexpected when the release page leaves the repository', async () => {
    const { source: releases } = source(json(release({ html_url: 'https://example.com/x' })))

    expect(codeOf(await releases.latest())).toBe('DCK-UPD-002')
  })

  it('should fail as unexpected when the answer is not a release', async () => {
    const { source: releases } = source({ status: 200, headers: {}, body: '<html>' })

    expect(codeOf(await releases.latest())).toBe('DCK-UPD-002')
  })

  it('should fail to check when the server refuses or the rate limit is reached', async () => {
    const { source: releases } = source(json({ message: 'rate limit' }, 403))

    expect(codeOf(await releases.latest())).toBe('DCK-UPD-001')
  })

  it('should fail to check when there is no network', async () => {
    const { source: releases } = source('network')

    expect(codeOf(await releases.latest())).toBe('DCK-UPD-001')
  })

  it('should use the given roots when a local feed replaces GitHub', async () => {
    const local = 'http://127.0.0.1:4000'
    const fake = fakeHttp(
      json(
        release({
          html_url: `${local}/acme/backend/releases/tag/v0.10.0`,
          assets: [],
        }),
      ),
    )
    const releases = createGitHubReleaseSource({
      http: fake.http,
      repository: 'acme/backend',
      appVersion: '0.9.0',
      apiRoot: local,
      webRoot: local,
    })

    const result = await releases.latest()

    expect(fake.requests[0]?.url).toBe(`${local}/repos/acme/backend/releases/latest`)
    expect(result.ok && result.value?.page).toBe(`${local}/acme/backend/releases/tag/v0.10.0`)
  })
})

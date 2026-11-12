import { describe, expect, it } from 'vitest'
import { createFetchHttpClient } from './fetch-http-client.ts'

describe('createFetchHttpClient', () => {
  it('should return the status, lowercase headers and body when the server answers', async () => {
    const fake = (async () =>
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'X-Next-Page': '2' },
      })) as unknown as typeof fetch

    const result = await createFetchHttpClient(fake).get({ url: 'https://example.test/a' })

    expect(result).toEqual({
      ok: true,
      value: {
        status: 200,
        headers: { 'x-next-page': '2', 'content-type': 'text/plain;charset=UTF-8' },
        body: '{"ok":true}',
      },
    })
  })

  it('should return an error status as a response when the server refuses', async () => {
    const fake = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch

    const result = await createFetchHttpClient(fake).get({ url: 'https://example.test/a' })

    expect(result.ok && result.value.status).toBe(401)
  })

  it('should fail with the no response code when the network fails', async () => {
    const fake = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch

    const result = await createFetchHttpClient(fake).get({ url: 'https://example.test/a' })

    expect(!result.ok && result.error.data?.code).toBe('DCK-NET-001')
  })

  it('should send the given headers when requesting', async () => {
    let seen: unknown
    const fake = (async (_url: string, init?: RequestInit) => {
      seen = init?.headers
      return new Response('')
    }) as unknown as typeof fetch

    await createFetchHttpClient(fake).get({
      url: 'https://example.test/a',
      headers: { 'private-token': 't' },
    })

    expect(seen).toEqual({ 'private-token': 't' })
  })
})

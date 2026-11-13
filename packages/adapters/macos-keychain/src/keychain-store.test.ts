import type { Result } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createKeychainStore, type ToolRun, type ToolRunner } from './keychain-store.ts'

const codeOf = (result: Result<unknown, { data?: { code?: string } }>) =>
  result.ok ? undefined : result.error.data?.code

const recorder = (response: ToolRun) => {
  const calls: { args: readonly string[]; stdin: string | undefined }[] = []
  const run: ToolRunner = async (args, stdin) => {
    calls.push({ args, stdin })
    return response
  }
  return { run, calls }
}

describe('createKeychainStore', () => {
  it('should return the secret without the final line break when the item exists', async () => {
    const { run, calls } = recorder({ status: 0, stdout: 'glpat-123\n' })

    const result = await createKeychainStore(run).get('gitlab.token')

    expect(result).toEqual({ ok: true, value: 'glpat-123' })
    expect(calls[0]?.args).toEqual([
      'find-generic-password',
      '-s',
      'dev-cockpit',
      '-a',
      'gitlab.token',
      '-w',
    ])
  })

  it('should return undefined when the item does not exist', async () => {
    const { run } = recorder({ status: 44, stdout: '' })

    const result = await createKeychainStore(run).get('gitlab.token')

    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('should pass the secret through stdin and never in the arguments when storing', async () => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    const result = await createKeychainStore(run).set('gitlab.token', 'glpat-123')

    expect(result.ok).toBe(true)
    expect(calls[0]?.args).toEqual(['-i'])
    expect(calls[0]?.stdin).toBe(
      'add-generic-password -U -l "Dev Cockpit: gitlab.token" -s "dev-cockpit" -a "gitlab.token" -w "glpat-123"\n',
    )
  })

  it('should escape quotes and backslashes when the value has them', async () => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    await createKeychainStore(run).set('k', 'a "quoted" $HOME \\ it\'s')

    expect(calls[0]?.stdin).toContain('-w "a \\"quoted\\" $HOME \\\\ it\'s"\n')
  })

  it.each([
    { kind: 'has a line break', value: 'line1\nline2' },
    { kind: 'has a carriage return', value: 'line1\rline2' },
    { kind: 'is not ASCII', value: 'ação' },
  ])('should refuse the value without calling security when it $kind', async ({ value }) => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    const result = await createKeychainStore(run).set('k', value)

    expect(codeOf(result)).toBe('DCK-SEC-002')
    expect(calls).toHaveLength(0)
  })

  it('should delete the item when deleting', async () => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    const result = await createKeychainStore(run).delete('gitlab.token')

    expect(result.ok).toBe(true)
    expect(calls[0]?.args).toEqual([
      'delete-generic-password',
      '-s',
      'dev-cockpit',
      '-a',
      'gitlab.token',
    ])
  })

  it('should succeed when deleting an item that does not exist', async () => {
    const { run } = recorder({ status: 44, stdout: '' })

    const result = await createKeychainStore(run).delete('gitlab.token')

    expect(result.ok).toBe(true)
  })

  it.each([
    { code: 'DCK-SEC-001', when: 'security is not installed', status: 'missing' as const },
    { code: 'DCK-SEC-002', when: 'the keychain rejects the operation', status: 1 },
  ])('should fail with $code when $when', async ({ code, status }) => {
    const store = createKeychainStore(recorder({ status, stdout: '' }).run)

    const results = [await store.get('k'), await store.set('k', 'v'), await store.delete('k')]

    expect(results.map(codeOf)).toEqual([code, code, code])
  })
})

// Writes to the real login keychain, so it runs only on macOS CI or with DCK_KEYCHAIN_TEST=1
const realKeychain =
  process.platform === 'darwin' &&
  (process.env.CI === 'true' || process.env.DCK_KEYCHAIN_TEST === '1')

describe.skipIf(!realKeychain)('createKeychainStore with the real keychain', () => {
  it('should store, replace, read and delete a secret when using the login keychain', async () => {
    const store = createKeychainStore()
    const key = `test.${process.pid}.${Date.now()}`
    const value = 'a "quoted" $HOME \\ it\'s'

    const stored = await store.set(key, value)
    const read = await store.get(key)
    const replaced = await store.set(key, 'second')
    const reread = await store.get(key)
    const deleted = await store.delete(key)
    const gone = await store.get(key)
    const deletedAgain = await store.delete(key)

    expect(stored.ok).toBe(true)
    expect(read).toEqual({ ok: true, value })
    expect(replaced.ok).toBe(true)
    expect(reread).toEqual({ ok: true, value: 'second' })
    expect(deleted.ok).toBe(true)
    expect(gone).toEqual({ ok: true, value: undefined })
    expect(deletedAgain.ok).toBe(true)
  })
})

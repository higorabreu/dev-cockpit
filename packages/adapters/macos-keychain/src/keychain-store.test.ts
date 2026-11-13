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

    const result = await createKeychainStore({ run }).get('gitlab.token')

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

    const result = await createKeychainStore({ run }).get('gitlab.token')

    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('should pass the secret through stdin and never in the arguments when storing', async () => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    const result = await createKeychainStore({ run }).set('gitlab.token', 'glpat-123')

    expect(result.ok).toBe(true)
    expect(calls[0]?.args).toEqual(['-i'])
    expect(calls[0]?.stdin).toBe(
      'add-generic-password -U -l "Dev Cockpit: gitlab.token" -s "dev-cockpit" -a "gitlab.token" -w "glpat-123"\n',
    )
  })

  it('should escape quotes and backslashes when the value has them', async () => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    await createKeychainStore({ run }).set('k', 'a "quoted" $HOME \\ it\'s')

    expect(calls[0]?.stdin).toContain('-w "a \\"quoted\\" $HOME \\\\ it\'s"\n')
  })

  it.each([
    { kind: 'has a line break', value: 'line1\nline2' },
    { kind: 'has a carriage return', value: 'line1\rline2' },
    { kind: 'is not ASCII', value: 'ação' },
  ])('should refuse the value without calling security when it $kind', async ({ value }) => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    const result = await createKeychainStore({ run }).set('k', value)

    expect(codeOf(result)).toBe('DCK-SEC-002')
    expect(calls).toHaveLength(0)
  })

  it('should call delete-generic-password with the service and the key when deleting', async () => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    const result = await createKeychainStore({ run }).delete('gitlab.token')

    expect(result.ok).toBe(true)
    expect(calls[0]?.args).toEqual([
      'delete-generic-password',
      '-s',
      'dev-cockpit',
      '-a',
      'gitlab.token',
    ])
  })

  it.each([
    { kind: 'has a space', key: 'gitlab token' },
    { kind: 'has a quote', key: 'a"b' },
    { kind: 'is empty', key: '' },
  ])('should refuse the key without calling security when it $kind', async ({ key }) => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    const result = await createKeychainStore({ run }).set(key, 'v')

    expect(codeOf(result)).toBe('DCK-SEC-002')
    expect(calls).toHaveLength(0)
  })

  it.each([
    { length: 4094, accepted: true },
    { length: 4095, accepted: false },
  ])(
    'should accept a command line only up to 4094 bytes when it has $length',
    async ({ length, accepted }) => {
      const { run, calls } = recorder({ status: 0, stdout: '' })
      const empty = 'add-generic-password -U -l "Dev Cockpit: k" -s "dev-cockpit" -a "k" -w ""'
      const value = 'x'.repeat(length - empty.length)

      const result = await createKeychainStore({ run }).set('k', value)

      expect(result.ok).toBe(accepted)
      expect(calls).toHaveLength(accepted ? 1 : 0)
      if (accepted) expect(calls[0]?.stdin).toHaveLength(length + 1)
    },
  )

  it('should use the injected service in the arguments and in the line when it is valid', async () => {
    const { run, calls } = recorder({ status: 0, stdout: '' })
    const store = createKeychainStore({ run, service: 'dev-cockpit-test' })

    await store.get('k')
    await store.set('k', 'v')

    expect(calls[0]?.args).toEqual([
      'find-generic-password',
      '-s',
      'dev-cockpit-test',
      '-a',
      'k',
      '-w',
    ])
    expect(calls[1]?.stdin).toContain('-s "dev-cockpit-test" -a "k"')
  })

  it.each([
    { kind: 'is empty', service: '' },
    { kind: 'has a space', service: 'dev cockpit' },
    { kind: 'has a quote', service: 'dev"cockpit' },
    { kind: 'has a line break', service: 'dev\ncockpit' },
    { kind: 'starts like an option', service: 'dev cockpit -w' },
    { kind: 'is longer than 128 characters', service: 'd'.repeat(129) },
    { kind: 'has a multi-byte character', service: 'dev-cockpit-ç' },
  ])('should throw an invariant at creation when the service $kind', ({ service }) => {
    const { run } = recorder({ status: 0, stdout: '' })

    const create = () => createKeychainStore({ run, service })

    expect(create).toThrow(/^invariant: /)
  })

  it('should keep the line within 4094 bytes when the longest service and key are used', async () => {
    const { run, calls } = recorder({ status: 0, stdout: '' })
    const name = 'n'.repeat(128)
    const store = createKeychainStore({ run, service: name })
    const empty = `add-generic-password -U -l "Dev Cockpit: ${name}" -s "${name}" -a "${name}" -w ""`
    const value = 'x'.repeat(4094 - empty.length)

    const fits = await store.set(name, value)
    const over = await store.set(name, `${value}x`)

    expect(fits.ok).toBe(true)
    expect(Buffer.byteLength(calls[0]?.stdin ?? '')).toBe(4095)
    expect(codeOf(over)).toBe('DCK-SEC-002')
    expect(calls).toHaveLength(1)
  })

  it('should keep the value out of the arguments and the error when storing fails', async () => {
    const { run, calls } = recorder({ status: 1, stdout: '' })

    const result = await createKeychainStore({ run }).set('gitlab.token', 'glpat-secret')

    expect(result.ok).toBe(false)
    expect(calls[0]?.args.join(' ')).not.toContain('glpat-secret')
    expect(JSON.stringify(result)).not.toContain('glpat-secret')
  })

  it('should succeed when deleting an item that does not exist', async () => {
    const { run } = recorder({ status: 44, stdout: '' })

    const result = await createKeychainStore({ run }).delete('gitlab.token')

    expect(result.ok).toBe(true)
  })

  it.each([
    { code: 'DCK-SEC-001', when: 'security is not installed', status: 'missing' as const },
    { code: 'DCK-SEC-002', when: 'the keychain rejects the operation', status: 1 },
  ])('should fail with $code when $when', async ({ code, status }) => {
    const store = createKeychainStore({ run: recorder({ status, stdout: '' }).run })

    const results = [await store.get('k'), await store.set('k', 'v'), await store.delete('k')]

    expect(results.map(codeOf)).toEqual([code, code, code])
  })
})

// Writes to the default keychain, so it runs only when asked; CI points it at a temporary keychain
const realKeychain = process.platform === 'darwin' && process.env.DCK_KEYCHAIN_TEST === '1'

describe.skipIf(!realKeychain)('createKeychainStore with the real keychain', () => {
  it('should store, replace, read and delete a secret when using the default keychain', async () => {
    const store = createKeychainStore({ service: 'dev-cockpit-test' })
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

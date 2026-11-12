import type { Result } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createSecretToolStore, type ToolRun, type ToolRunner } from './secret-tool-store.ts'

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

describe('createSecretToolStore', () => {
  it('should return the secret when the lookup succeeds', async () => {
    const { run, calls } = recorder({ status: 0, stdout: 'glpat-123' })

    const result = await createSecretToolStore(run).get('gitlab.token')

    expect(result).toEqual({ ok: true, value: 'glpat-123' })
    expect(calls[0]?.args).toEqual(['lookup', 'service', 'dev-cockpit', 'key', 'gitlab.token'])
  })

  it('should return undefined when the key does not exist', async () => {
    const { run } = recorder({ status: 1, stdout: '' })

    const result = await createSecretToolStore(run).get('gitlab.token')

    expect(result).toEqual({ ok: true, value: undefined })
  })

  it('should pass the secret through stdin and never in the arguments when storing', async () => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    const result = await createSecretToolStore(run).set('gitlab.token', 'glpat-123')

    expect(result.ok).toBe(true)
    expect(calls[0]?.stdin).toBe('glpat-123')
    expect(calls[0]?.args.join(' ')).not.toContain('glpat-123')
  })

  it('should clear the entry when deleting', async () => {
    const { run, calls } = recorder({ status: 0, stdout: '' })

    const result = await createSecretToolStore(run).delete('gitlab.token')

    expect(result.ok).toBe(true)
    expect(calls[0]?.args[0]).toBe('clear')
  })

  it('should succeed when deleting an entry that does not exist', async () => {
    const { run } = recorder({ status: 1, stdout: '' })

    const result = await createSecretToolStore(run).delete('gitlab.token')

    expect(result.ok).toBe(true)
  })

  it('should fail with the unavailable code when secret-tool is not installed', async () => {
    const { run } = recorder({ status: 'missing', stdout: '' })
    const store = createSecretToolStore(run)

    expect(codeOf(await store.get('k'))).toBe('DCK-SEC-001')
    expect(codeOf(await store.set('k', 'v'))).toBe('DCK-SEC-001')
    expect(codeOf(await store.delete('k'))).toBe('DCK-SEC-001')
  })

  it('should fail with the refused code when the keyring rejects the operation', async () => {
    const { run } = recorder({ status: 2, stdout: '' })

    expect(codeOf(await createSecretToolStore(run).set('k', 'v'))).toBe('DCK-SEC-002')
  })
})

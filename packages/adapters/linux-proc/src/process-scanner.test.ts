import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProcessScanner } from './process-scanner.ts'

let proc = ''

beforeEach(async () => {
  proc = await mkdtemp(join(tmpdir(), 'dck-scan-'))
})

afterEach(() => rm(proc, { recursive: true, force: true }))

async function fake(pid: number, args: string[], env: string[] = []) {
  await mkdir(join(proc, String(pid)), { recursive: true })
  await writeFile(join(proc, String(pid), 'cmdline'), `${args.join('\0')}\0`)
  await writeFile(join(proc, String(pid), 'environ'), `${env.join('\0')}\0`)
}

const script = '/app/dist/daemon.cjs'

describe('createProcessScanner', () => {
  it('should find the processes that run the script on the default endpoint when none sets one', async () => {
    await fake(10, ['/bin/electron', script])
    await fake(11, ['/bin/zsh'])

    expect(
      await createProcessScanner(proc).find({ argument: script, endpoint: undefined }),
    ).toEqual([10])
  })

  it('should only find the processes of the given endpoint when an endpoint is set', async () => {
    await fake(10, ['/bin/electron', script], ['DCK_ENDPOINT=/tmp/a.sock'])
    await fake(11, ['/bin/electron', script], ['DCK_ENDPOINT=/tmp/b.sock'])
    await fake(12, ['/bin/electron', script])

    const scanner = createProcessScanner(proc)

    expect(await scanner.find({ argument: script, endpoint: '/tmp/a.sock' })).toEqual([10])
    expect(await scanner.find({ argument: script, endpoint: undefined })).toEqual([12])
  })

  it('should skip the excluded pid and non numeric entries when scanning', async () => {
    await fake(10, ['/bin/electron', script])
    await mkdir(join(proc, 'self'), { recursive: true })

    expect(
      await createProcessScanner(proc).find({ argument: script, endpoint: undefined, exclude: 10 }),
    ).toEqual([])
  })

  it('should return nothing when the proc folder does not exist', async () => {
    expect(
      await createProcessScanner(join(proc, 'missing')).find({
        argument: script,
        endpoint: undefined,
      }),
    ).toEqual([])
  })
})

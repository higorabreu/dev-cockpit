import { UNKNOWN_FOREGROUND } from '@dck/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommandRunner } from './command-runner.ts'
import { createProcessInspector } from './process-inspector.ts'

const shell = 4100
const other = 4200

// Process table as `ps -axo pid=,tpgid=,ucomm=` prints it
const table = [
  `  ${shell}  4180 zsh`,
  '  4180  4180 claude          ',
  `  ${other}  ${other} zsh`,
  '  4300     0 Code Helper     ',
  '  4400  4410 zsh',
  '  4410  4410 Code Helper     ',
  '',
].join('\n')

const lsof = (cwds: Record<number, string>) =>
  Object.entries(cwds)
    .map(([pid, path]) => `p${pid}\nfcwd\nn${path}\n`)
    .join('')

const recorder = (outputs: { lsof?: string; ps?: string }) => {
  const calls: string[] = []
  const run: CommandRunner = async (command, args) => {
    calls.push([command, ...args].join(' '))
    return command === 'lsof' ? outputs.lsof : outputs.ps
  }
  return { inspector: createProcessInspector(run, 0), calls }
}

// Recorded with `LC_ALL=C lsof -b -w -a -d cwd -Fn`, as an app opened from Finder runs it
const escapedLsof = [
  'p4100',
  'fcwd',
  'n/Users/ana/projetos/a\\xc3\\xa7\\xc3\\xa3o com espa\\xc3\\xa7o',
  'p4200',
  'fcwd',
  'n/Users/ana/back\\\\slash/nl\\nline\\ttab',
  '',
].join('\n')

describe('createProcessInspector', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return the directory and the foreground command when the shell runs one', async () => {
    const { inspector } = recorder({
      lsof: lsof({ [shell]: '/Users/ana/projects/acme' }),
      ps: table,
    })

    const info = await inspector.inspect(shell)

    expect(info).toEqual({
      cwd: '/Users/ana/projects/acme',
      foreground: 'claude',
      foregroundPid: 4180,
    })
  })

  it('should report the shell itself when it is at the prompt', async () => {
    const { inspector } = recorder({ lsof: lsof({ [other]: '/Users/ana' }), ps: table })

    const info = await inspector.inspect(other)

    expect(info).toEqual({ cwd: '/Users/ana', foreground: 'zsh', foregroundPid: other })
  })

  it('should share one lsof and one ps when several tabs are inspected at once', async () => {
    const { inspector, calls } = recorder({
      lsof: lsof({ [shell]: '/Users/ana/projects/acme', [other]: '/Users/ana' }),
      ps: table,
    })

    const [first, second] = await Promise.all([inspector.inspect(shell), inspector.inspect(other)])

    expect([first?.foreground, second?.foreground]).toEqual(['claude', 'zsh'])
    expect(calls).toEqual([
      `lsof -b -w -a -d cwd -Fn -p ${shell},${other}`,
      'ps -axo pid=,tpgid=,ucomm=',
    ])
  })

  it('should return undefined when the process no longer exists', async () => {
    const { inspector } = recorder({ ps: table })

    const info = await inspector.inspect(shell)

    expect(info).toBeUndefined()
  })

  it('should keep the directory with an unknown command when the foreground group is gone', async () => {
    const { inspector } = recorder({
      lsof: lsof({ [shell]: '/Users/ana' }),
      ps: `  ${shell}  4180 zsh\n`,
    })

    const info = await inspector.inspect(shell)

    expect(info).toEqual({ cwd: '/Users/ana', foreground: UNKNOWN_FOREGROUND, foregroundPid: 4180 })
  })

  it('should keep the directory without a foreground pid when the process has no terminal', async () => {
    const { inspector } = recorder({ lsof: lsof({ 4300: '/' }), ps: table })

    const info = await inspector.inspect(4300)

    expect(info).toEqual({ cwd: '/', foreground: UNKNOWN_FOREGROUND })
  })

  it('should decode the escaped bytes when lsof prints an accented folder', async () => {
    const { inspector } = recorder({ lsof: escapedLsof, ps: table })

    const [accented, controls] = await Promise.all([
      inspector.inspect(shell),
      inspector.inspect(other),
    ])

    expect(accented?.cwd).toBe('/Users/ana/projetos/ação com espaço')
    expect(controls?.cwd).toBe('/Users/ana/back\\slash/nl\nline\ttab')
  })

  it('should keep the spaces when the folder and the foreground name have them', async () => {
    const { inspector } = recorder({
      lsof: lsof({ 4400: '/Users/ana/my projects/acme' }),
      ps: table,
    })

    const info = await inspector.inspect(4400)

    expect(info).toEqual({
      cwd: '/Users/ana/my projects/acme',
      foreground: 'Code Helper',
      foregroundPid: 4410,
    })
  })

  it('should keep the directory with an unknown command when the pid leaves before ps runs', async () => {
    const { inspector } = recorder({ lsof: lsof({ 4500: '/Users/ana' }), ps: table })

    const info = await inspector.inspect(4500)

    expect(info).toEqual({ cwd: '/Users/ana', foreground: UNKNOWN_FOREGROUND })
  })

  it('should resolve every caller with undefined when a command rejects', async () => {
    const run: CommandRunner = async () => {
      throw new Error('spawn failed')
    }
    const inspector = createProcessInspector(run, 0)

    const infos = await Promise.all([inspector.inspect(shell), inspector.inspect(other)])

    expect(infos).toEqual([undefined, undefined])
  })

  it('should resolve with undefined when a command never settles past the deadline', async () => {
    const run: CommandRunner = () => new Promise(() => undefined)
    const inspector = createProcessInspector(run, 0, 5)

    const info = await inspector.inspect(shell)

    expect(info).toBeUndefined()
  })

  it('should answer each batch with its own output when two batches overlap', async () => {
    let release = () => undefined as void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const run: CommandRunner = async (command, args) => {
      if (command === 'ps') return table
      const pid = Number(args.at(-1))
      if (pid === shell) await held
      return lsof({ [pid]: pid === shell ? '/Users/ana/projects/acme' : '/Users/ana' })
    }
    const inspector = createProcessInspector(run, 0)

    const first = inspector.inspect(shell)
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await inspector.inspect(other)
    release()

    expect(second).toEqual({ cwd: '/Users/ana', foreground: 'zsh', foregroundPid: other })
    expect((await first)?.foreground).toBe('claude')
  })

  it('should resolve every caller with undefined when the runner throws before returning', async () => {
    vi.useFakeTimers()
    const run: CommandRunner = () => {
      throw new Error('spawn EAGAIN')
    }
    const inspector = createProcessInspector(run, 10, 100)

    const infos = Promise.all([inspector.inspect(shell), inspector.inspect(other)])
    await vi.advanceTimersByTimeAsync(10)

    expect(await infos).toEqual([undefined, undefined])
    expect(vi.getTimerCount()).toBe(0)
  })

  it('should leave no timer behind when a batch answers before the deadline', async () => {
    vi.useFakeTimers()
    const run: CommandRunner = async (command) =>
      command === 'lsof' ? lsof({ [shell]: '/Users/ana' }) : table
    const inspector = createProcessInspector(run, 10, 100)

    const info = inspector.inspect(shell)
    await vi.advanceTimersByTimeAsync(10)

    expect((await info)?.foreground).toBe('claude')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('should answer new batches with undefined without running again while a batch is stuck past the deadline', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    let release: () => void = () => undefined
    const stuck = new Promise<undefined>((resolve) => {
      release = () => resolve(undefined)
    })
    const run: CommandRunner = async (command) => {
      calls.push(command)
      if (command === 'ps') return table
      return calls.length === 1 ? stuck : lsof({ [other]: '/Users/ana' })
    }
    const inspector = createProcessInspector(run, 10, 100)

    const first = inspector.inspect(shell)
    await vi.advanceTimersByTimeAsync(110)
    const second = inspector.inspect(other)
    await vi.advanceTimersByTimeAsync(10)
    const answers = [await first, await second]
    const callsWhileStuck = calls.length
    release()
    await vi.advanceTimersByTimeAsync(0)
    const third = inspector.inspect(other)
    await vi.advanceTimersByTimeAsync(10)

    expect(answers).toEqual([undefined, undefined])
    expect(callsWhileStuck).toBe(2)
    expect(await third).toEqual({ cwd: '/Users/ana', foreground: 'zsh', foregroundPid: other })
    expect(vi.getTimerCount()).toBe(0)
  })
})

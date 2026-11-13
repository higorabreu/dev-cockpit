import { describe, expect, it } from 'vitest'
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

describe('createProcessInspector', () => {
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
    expect(calls).toEqual([`lsof -a -d cwd -Fn -p ${shell},${other}`, 'ps -axo pid=,tpgid=,ucomm='])
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

    expect(info).toEqual({ cwd: '/Users/ana', foreground: 'desconhecido', foregroundPid: 4180 })
  })

  it('should keep the directory without a foreground pid when the process has no terminal', async () => {
    const { inspector } = recorder({ lsof: lsof({ 4300: '/' }), ps: table })

    const info = await inspector.inspect(4300)

    expect(info).toEqual({ cwd: '/', foreground: 'desconhecido' })
  })
})

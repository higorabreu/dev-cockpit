import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createNodePtyHost } from './pty-host.ts'

const host = createNodePtyHost()

interface Command {
  readonly file: string
  readonly args: string[]
}

// The same behaviors through each system's own programs: Windows has no /bin and runs through ConPTY
const windows = process.platform === 'win32'
const commands = {
  print: (text: string): Command =>
    windows
      ? { file: 'cmd.exe', args: ['/c', `echo ${text}`] }
      : { file: '/bin/echo', args: [text] },
  exit: (code: number): Command =>
    windows
      ? { file: 'cmd.exe', args: ['/c', `exit ${code}`] }
      : { file: '/bin/sh', args: ['-c', `exit ${code}`] },
  // A program that waits for typed lines and shows them
  echoInput: (): Command =>
    windows ? { file: 'cmd.exe', args: [] } : { file: '/bin/cat', args: [] },
  // Prints "rows columns" after a pause long enough to resize first
  size: (): Command =>
    windows
      ? {
          file: 'powershell.exe',
          args: [
            '-NoLogo',
            '-NoProfile',
            '-Command',
            'Start-Sleep -Milliseconds 300; "$([Console]::WindowHeight) $([Console]::WindowWidth)"',
          ],
        }
      : { file: '/bin/sh', args: ['-c', 'sleep 0.3; stty size'] },
  printDirectory: (): Command =>
    windows ? { file: 'cmd.exe', args: ['/c', 'cd'] } : { file: '/bin/pwd', args: [] },
}

function collect(command: Command, cwd?: string) {
  const session = host.spawn({ ...command, ...(cwd ? { cwd } : {}), cols: 80, rows: 24 })
  let output = ''
  session.onData((data) => {
    output += data
  })
  const exited = new Promise<{ code: number | null }>((resolve) => session.onExit(resolve))
  return { session, exited, output: () => output }
}

describe('createNodePtyHost', () => {
  it('should emit the process output when it prints something', async () => {
    const run = collect(commands.print('olá cockpit'))

    await run.exited

    expect(run.output()).toContain('olá cockpit')
  })

  it('should report the exit code when the process ends', async () => {
    const run = collect(commands.exit(3))

    const exit = await run.exited

    expect(exit.code).toBe(3)
  })

  it('should deliver typed input to the process when writing to the session', async () => {
    const run = collect(commands.echoInput())

    run.session.write('digitado\r')
    await new Promise((resolve) => setTimeout(resolve, 300))
    run.session.kill()
    await run.exited

    expect(run.output()).toContain('digitado')
  })

  it('should apply the window size to the process when resizing', async () => {
    const run = collect(commands.size())

    run.session.resize(100, 30)
    await run.exited

    expect(run.output()).toContain('30 100')
  }, 15_000)

  it('should run the process in the requested directory when a cwd is given', async () => {
    const directory = tmpdir()
    const run = collect(commands.printDirectory(), directory)

    await run.exited

    // ConPTY may wrap a long path at the terminal's width
    expect(run.output().replace(/\r?\n/g, '')).toContain(directory)
  })

  it('should stop delivering data when the listener is unsubscribed', async () => {
    const session = host.spawn({ ...commands.echoInput(), cols: 80, rows: 24 })
    let received = 0
    const unsubscribe = session.onData(() => {
      received += 1
    })

    unsubscribe()
    session.write('ignorado\r')
    await new Promise((resolve) => setTimeout(resolve, 200))
    session.kill()

    expect(received).toBe(0)
  })
})

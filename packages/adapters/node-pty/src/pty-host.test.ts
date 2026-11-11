import { describe, expect, it } from 'vitest'
import { createNodePtyHost } from './pty-host.ts'

const host = createNodePtyHost()

function collect(command: string, args: string[]) {
  const session = host.spawn({ file: command, args, cols: 80, rows: 24 })
  let output = ''
  session.onData((data) => {
    output += data
  })
  const exited = new Promise<{ code: number | null }>((resolve) => session.onExit(resolve))
  return { session, exited, output: () => output }
}

describe('createNodePtyHost', () => {
  it('should emit the process output when it prints something', async () => {
    const run = collect('/bin/echo', ['olá cockpit'])

    await run.exited

    expect(run.output()).toContain('olá cockpit')
  })

  it('should report the exit code when the process ends', async () => {
    const run = collect('/bin/sh', ['-c', 'exit 3'])

    const exit = await run.exited

    expect(exit.code).toBe(3)
  })

  it('should deliver typed input to the process when writing to the session', async () => {
    const run = collect('/bin/cat', [])

    run.session.write('digitado\n')
    await new Promise((resolve) => setTimeout(resolve, 300))
    run.session.kill()
    await run.exited

    expect(run.output()).toContain('digitado')
  })

  it('should apply the window size to the process when resizing', async () => {
    const run = collect('/bin/sh', ['-c', 'sleep 0.3; stty size'])

    run.session.resize(100, 30)
    await run.exited

    expect(run.output()).toContain('30 100')
  })

  it('should run the process in the requested directory when a cwd is given', async () => {
    const session = host.spawn({ file: '/bin/pwd', args: [], cwd: '/tmp', cols: 80, rows: 24 })
    let output = ''
    session.onData((data) => {
      output += data
    })

    await new Promise((resolve) => session.onExit(resolve))

    expect(output).toContain('/tmp')
  })

  it('should stop delivering data when the listener is unsubscribed', async () => {
    const session = host.spawn({ file: '/bin/cat', args: [], cols: 80, rows: 24 })
    let received = 0
    const unsubscribe = session.onData(() => {
      received += 1
    })
    unsubscribe()

    session.write('ignorado\n')
    await new Promise((resolve) => setTimeout(resolve, 200))
    session.kill()

    expect(received).toBe(0)
  })
})

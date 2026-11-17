// @vitest-environment happy-dom
import type { ProgramStatus } from '@dck/core'
import { Terminal } from '@xterm/xterm'
import { describe, expect, it } from 'vitest'
import { attachProgramStatus } from './program-status.ts'

// A real xterm parser, so the sequences go through the same code as in a tab
function setup() {
  const terminal = new Terminal()
  const replies: string[] = []
  const reports: ProgramStatus[] = []
  const handler = attachProgramStatus(terminal.parser, {
    reply: (data) => void replies.push(data),
    report: (status) => void reports.push(status),
  })
  const write = (data: string) => new Promise<void>((resolve) => terminal.write(data, resolve))
  const screen = () => terminal.buffer.active.getLine(0)?.translateToString(true) ?? ''
  return { terminal, handler, replies, reports, write, screen }
}

describe('attachProgramStatus', () => {
  it('should report each state when Codex writes its status around a turn', async () => {
    // Arrange: what Codex 0.169.0 wrote to its terminal through a prompt, an approval, an answer and /exit
    const { reports, write } = setup()
    const sequences = [
      '\x1b]7501;state=idle:app=codex\x1b\\',
      '\x1b]7501;state=working:app=codex\x1b\\',
      '\x1b]7501;state=blocked:app=codex:kind=permission\x1b\\',
      '\x1b]7501;state=working:app=codex\x1b\\',
      '\x1b]7501;state=done:app=codex\x1b\\',
      '\x1b]7501;state=clear\x1b\\',
    ]

    // Act
    await write(sequences.join(''))

    // Assert
    expect(reports).toEqual(['idle', 'working', 'needs-you', 'working', 'your-turn', 'ended'])
  })

  it('should read a report when it ends with BEL instead of ST', async () => {
    const { reports, write } = setup()

    await write('\x1b]7501;state=blocked:app=opencode:kind=question\x07')

    expect(reports).toEqual(['needs-you'])
  })

  it('should print nothing and report nothing when the report is malformed or unknown', async () => {
    const { reports, write, screen } = setup()

    await write(
      '\x1b]7501;state=sleeping\x1b\\\x1b]7501;garbage\x07\x1b]7501;state=working:id=a\x07ok',
    )

    expect(reports).toEqual([])
    expect(screen()).toBe('ok')
  })

  it('should answer the program when it asks whether the terminal reads the reports', async () => {
    const { replies, reports, write } = setup()

    await write('\x1b]7501;?\x1b\\')

    expect(replies).toEqual(['\x1b]7501;?\x1b\\'])
    expect(reports).toEqual([])
  })

  it('should stop reading reports when the handler is disposed', async () => {
    const { handler, reports, write } = setup()

    handler.dispose()
    await write('\x1b]7501;state=working:app=codex\x1b\\')

    expect(reports).toEqual([])
  })
})

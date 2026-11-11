import { describe, expect, it } from 'vitest'
import {
  forwardedCommand,
  isOurCommand,
  planInstall,
  planUninstall,
  reportCommand,
  shellQuote,
} from './statusline-settings.ts'

const parts = { node: '/opt/node/bin/node', script: '/home/u/dck/packages/cli/src/main.ts' }

describe('reportCommand', () => {
  it('should quote the node and script paths and name the report command', () => {
    expect(reportCommand(parts)).toBe(
      "'/opt/node/bin/node' '/home/u/dck/packages/cli/src/main.ts' agent report --agent claude",
    )
  })

  it('should carry the original command after the forward flag when chaining', () => {
    expect(reportCommand(parts, 'my-line --x')).toContain("--forward 'my-line --x'")
  })

  it('should round trip a forwarded command with quotes in it', () => {
    const original = `echo "it's fine"`

    expect(forwardedCommand(reportCommand(parts, original))).toBe(original)
  })
})

describe('shellQuote', () => {
  it('should escape single quotes when quoting', () => {
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`)
  })
})

describe('isOurCommand', () => {
  it('should recognize the command it writes and nothing else', () => {
    expect(isOurCommand(reportCommand(parts))).toBe(true)
    expect(isOurCommand(reportCommand(parts, 'x'))).toBe(true)
    expect(isOurCommand('~/.claude/statusline.sh')).toBe(false)
  })
})

describe('planInstall', () => {
  it('should add the status line and keep every other setting when there is none', () => {
    const plan = planInstall({ model: 'opus', hooks: { a: 1 } }, parts)

    expect(plan.kind === 'ok' && plan.changed).toBe(true)
    expect(plan.kind === 'ok' && plan.next).toMatchObject({ model: 'opus', hooks: { a: 1 } })
    expect(plan.kind === 'ok' && plan.before).toBeUndefined()
    expect(plan.kind === 'ok' && plan.chained).toBeUndefined()
  })

  it('should chain the existing status line instead of replacing it when the user has one', () => {
    const plan = planInstall({ statusLine: { type: 'command', command: '~/bar.sh' } }, parts)

    expect(plan.kind === 'ok' && plan.chained).toBe('~/bar.sh')
    expect(plan.kind === 'ok' && forwardedCommand(plan.after.command)).toBe('~/bar.sh')
  })

  it('should change nothing when the same command is already installed', () => {
    const first = planInstall({}, parts)
    const settings = first.kind === 'ok' ? first.next : {}

    const again = planInstall(settings, parts)

    expect(again.kind === 'ok' && again.changed).toBe(false)
  })

  it('should keep the chained command when the paths change on a new install', () => {
    const old = planInstall({ statusLine: { type: 'command', command: '~/bar.sh' } }, parts)
    const moved = planInstall(old.kind === 'ok' ? old.next : {}, {
      node: '/n2/node',
      script: '/s2/main.ts',
    })

    expect(moved.kind === 'ok' && moved.changed).toBe(true)
    expect(moved.kind === 'ok' && moved.chained).toBe('~/bar.sh')
  })

  it('should refuse when the status line is of a type it does not know', () => {
    expect(planInstall({ statusLine: { type: 'weird' } }, parts).kind).toBe('unsupported')
  })

  it('should keep the other fields of the status line when it adds the command', () => {
    const plan = planInstall({ statusLine: { type: 'command', command: 'x', padding: 2 } }, parts)

    expect(plan.kind === 'ok' && plan.after.padding).toBe(2)
  })
})

describe('planUninstall', () => {
  it('should remove the status line when nothing was chained', () => {
    const installed = planInstall({ model: 'opus' }, parts)
    const plan = planUninstall(installed.kind === 'ok' ? installed.next : {})

    expect(plan.kind === 'ok' && plan.changed).toBe(true)
    expect(plan.kind === 'ok' && plan.next).toEqual({ model: 'opus' })
  })

  it('should restore the original status line when one was chained', () => {
    const installed = planInstall({ statusLine: { type: 'command', command: '~/bar.sh' } }, parts)
    const plan = planUninstall(installed.kind === 'ok' ? installed.next : {})

    expect(plan.kind === 'ok' && plan.after?.command).toBe('~/bar.sh')
  })

  it('should leave a status line that is not ours alone when uninstalling', () => {
    const settings = { statusLine: { type: 'command', command: '~/bar.sh' } }
    const plan = planUninstall(settings)

    expect(plan.kind === 'ok' && plan.changed).toBe(false)
    expect(plan.kind === 'ok' && plan.next).toBe(settings)
  })
})

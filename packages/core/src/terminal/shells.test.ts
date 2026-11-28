import { describe, expect, it } from 'vitest'
import { chooseShell, shellChoice, type TerminalShell, wslShellId } from './shells.ts'

const pwsh: TerminalShell = { id: 'pwsh', kind: 'pwsh', file: 'C:\\pwsh.exe', args: ['-NoLogo'] }
const cmd: TerminalShell = { id: 'cmd', kind: 'cmd', file: 'C:\\cmd.exe', args: [] }
const fallback = { file: '/bin/bash', args: [] }

describe('chooseShell', () => {
  it('should start the chosen shell when it is installed', () => {
    const shell = chooseShell('cmd', [pwsh, cmd], fallback)

    expect(shell).toEqual({ file: 'C:\\cmd.exe', args: [] })
  })

  it('should start the first shell found when nothing was chosen', () => {
    const shell = chooseShell(null, [pwsh, cmd], fallback)

    expect(shell).toEqual({ file: 'C:\\pwsh.exe', args: ['-NoLogo'] })
  })

  it('should start the first shell found when the chosen one was uninstalled', () => {
    const shell = chooseShell('gitBash', [pwsh, cmd], fallback)

    expect(shell.file).toBe('C:\\pwsh.exe')
  })

  it("should start the platform's default when the system lists no shell", () => {
    const shell = chooseShell('cmd', [], fallback)

    expect(shell).toEqual(fallback)
  })
})

describe('shellChoice', () => {
  it('should leave the command out when the screen lists a shell', () => {
    const ubuntu: TerminalShell = {
      id: wslShellId('Ubuntu'),
      kind: 'wsl',
      name: 'Ubuntu',
      file: 'wsl.exe',
      args: ['-d', 'Ubuntu'],
    }

    expect(shellChoice(ubuntu)).toEqual({ id: 'wsl:Ubuntu', kind: 'wsl', name: 'Ubuntu' })
    expect(shellChoice(cmd)).toEqual({ id: 'cmd', kind: 'cmd' })
  })
})

import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { chosenWslShell, detectWindowsShells, type ShellProbe, wslShells } from './shells.ts'

const env = {
  Path: 'C:\\Program Files\\PowerShell\\7;C:\\Program Files\\Git\\cmd;C:\\Windows\\System32',
  ProgramFiles: 'C:\\Program Files',
  SystemRoot: 'C:\\Windows',
  ComSpec: 'C:\\Windows\\System32\\cmd.exe',
}

const allInstalled = [
  'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Windows\\System32\\cmd.exe',
  'C:\\Windows\\System32\\bash.exe',
]

const probe = (files: readonly string[], environment = env): ShellProbe => ({
  env: environment,
  exists: (path) => files.includes(path),
})

describe('detectWindowsShells', () => {
  it('should list PowerShell 7 first, then Windows PowerShell, Git Bash and cmd when all are installed', () => {
    const shells = detectWindowsShells(probe(allInstalled))

    expect(shells.map((shell) => shell.id)).toEqual(['pwsh', 'powershell', 'gitBash', 'cmd'])
  })

  it('should start Windows PowerShell first when PowerShell 7 is not installed', () => {
    const shells = detectWindowsShells(
      probe(allInstalled.filter((file) => !file.endsWith('pwsh.exe'))),
    )

    expect(shells[0]).toEqual({
      id: 'powershell',
      kind: 'powershell',
      file: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      args: ['-NoLogo'],
    })
  })

  it('should take the bash beside git and never the WSL bash in System32 when Git is on the path', () => {
    const shells = detectWindowsShells(probe(allInstalled))

    expect(shells.find((shell) => shell.id === 'gitBash')).toEqual({
      id: 'gitBash',
      kind: 'gitBash',
      file: 'C:\\Program Files\\Git\\bin\\bash.exe',
      args: ['--login', '-i'],
    })
  })

  it('should find Git Bash in Program Files when git is not on the path', () => {
    const files = allInstalled.filter((file) => !file.endsWith('git.exe'))

    const shells = detectWindowsShells(probe(files, { ...env, Path: 'C:\\Windows\\System32' }))

    expect(shells.map((shell) => shell.id)).toContain('gitBash')
  })

  it('should find PowerShell 7 in its install folder when it is not on the path', () => {
    const shells = detectWindowsShells(probe(allInstalled, { ...env, Path: '' }))

    expect(shells[0]?.file).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
  })

  it('should list nothing when none of the shells exists', () => {
    expect(detectWindowsShells(probe([]))).toEqual([])
  })
})

const utf16 = (text: string) => Buffer.from(text, 'utf16le')

describe('wslShells', () => {
  it('should offer each distribution as a WSL shell when wsl.exe lists them in UTF-16', () => {
    const shells = wslShells(utf16('\uFEFFUbuntu-24.04\r\nDebian\r\n'), env)

    expect(shells).toEqual([
      {
        id: 'wsl:Ubuntu-24.04',
        kind: 'wsl',
        name: 'Ubuntu-24.04',
        file: 'C:\\Windows\\System32\\wsl.exe',
        args: ['-d', 'Ubuntu-24.04'],
      },
      {
        id: 'wsl:Debian',
        kind: 'wsl',
        name: 'Debian',
        file: 'C:\\Windows\\System32\\wsl.exe',
        args: ['-d', 'Debian'],
      },
    ])
  })

  it("should leave out Docker Desktop's distributions when they are installed", () => {
    const shells = wslShells(utf16('docker-desktop\r\nUbuntu\r\ndocker-desktop-data\r\n'), env)

    expect(shells.map((shell) => shell.name)).toEqual(['Ubuntu'])
  })

  it('should list nothing when no distribution is installed', () => {
    expect(wslShells(utf16(''), env)).toEqual([])
  })
})

describe('chosenWslShell', () => {
  const wsl = 'C:\\Windows\\System32\\wsl.exe'

  it('should start the chosen distribution without listing them when WSL is installed', () => {
    const shell = chosenWslShell('wsl:Ubuntu', probe([wsl]))

    expect(shell).toEqual({
      id: 'wsl:Ubuntu',
      kind: 'wsl',
      name: 'Ubuntu',
      file: wsl,
      args: ['-d', 'Ubuntu'],
    })
  })

  it('should give nothing when the chosen shell is not a distribution or WSL is gone', () => {
    expect(chosenWslShell('pwsh', probe([wsl]))).toBeUndefined()
    expect(chosenWslShell(null, probe([wsl]))).toBeUndefined()
    expect(chosenWslShell('wsl:Ubuntu', probe([]))).toBeUndefined()
  })
})

import type { AgentProfile } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createAgentLaunchers, type LauncherStats } from './agent-launchers.ts'

const claude: AgentProfile = {
  id: 'claude-code',
  name: 'Claude Code',
  processes: ['claude'],
  launch: 'claude',
}
const acme: AgentProfile = {
  id: 'acme',
  name: 'Acme Agent',
  processes: ['acme'],
  launch: 'acme run',
}
const watcherOnly: AgentProfile = { id: 'watcher', name: 'Watcher', processes: ['watcher'] }

type Entry = { readonly kind: 'file' | 'dir'; readonly mode: number }

// A fake disk: only the listed paths exist
function fakeDisk(entries: Record<string, Entry>) {
  const asked: string[] = []
  return {
    asked,
    stat: async (path: string): Promise<LauncherStats> => {
      asked.push(path)
      const entry = entries[path]
      if (!entry) throw new Error(`ENOENT: ${path}`)
      return { mode: entry.mode, isFile: () => entry.kind === 'file' }
    },
  }
}

const executable: Entry = { kind: 'file', mode: 0o755 }

describe('createAgentLaunchers', () => {
  it('should answer the agents whose command is an executable file in a PATH folder', async () => {
    // Arrange
    const disk = fakeDisk({
      '/home/ana/.local/bin/claude': executable,
      '/usr/bin/acme': executable,
    })
    const launchers = createAgentLaunchers({
      agents: [claude, acme, watcherOnly],
      path: async () => '/usr/local/bin:/home/ana/.local/bin:/usr/bin',
      platform: 'linux',
      stat: disk.stat,
    })

    // Act
    const found = await launchers.launchable()

    // Assert
    expect(found).toEqual([claude, acme])
  })

  it('should answer none when the command is missing, not executable or a folder', async () => {
    // Arrange
    const disk = fakeDisk({
      '/usr/local/bin/claude': { kind: 'file', mode: 0o644 },
      '/usr/bin/claude': { kind: 'dir', mode: 0o755 },
    })
    const launchers = createAgentLaunchers({
      agents: [claude, acme],
      path: async () => '/usr/local/bin:/usr/bin',
      platform: 'linux',
      stat: disk.stat,
    })

    // Act
    const found = await launchers.launchable()

    // Assert
    expect(found).toEqual([])
  })

  it('should skip relative and empty PATH entries and answer none without a PATH', async () => {
    // Arrange
    const disk = fakeDisk({ 'bin/claude': executable, claude: executable })
    const relative = createAgentLaunchers({
      agents: [claude],
      path: async () => ':bin:.',
      platform: 'linux',
      stat: disk.stat,
    })
    const missing = createAgentLaunchers({
      agents: [claude],
      path: async () => undefined,
      platform: 'linux',
      stat: disk.stat,
    })

    // Act
    const found = [...(await relative.launchable()), ...(await missing.launchable())]

    // Assert
    expect(found).toEqual([])
    expect(disk.asked).toEqual([])
  })

  it('should check an absolute launch command where it points instead of on the PATH', async () => {
    // Arrange
    const disk = fakeDisk({ '/opt/acme/bin/acme': executable })
    const pinned = { ...acme, launch: '/opt/acme/bin/acme --interactive' }
    const launchers = createAgentLaunchers({
      agents: [pinned],
      path: async () => '/usr/bin',
      platform: 'linux',
      stat: disk.stat,
    })

    // Act
    const found = await launchers.launchable()

    // Assert
    expect(found).toEqual([pinned])
    expect(disk.asked).toEqual(['/opt/acme/bin/acme'])
  })

  it('should find a command by its PATHEXT extension without an execute bit when on Windows', async () => {
    // Arrange
    const disk = fakeDisk({
      'C:\\Users\\ana\\AppData\\Roaming\\npm\\claude.CMD': { kind: 'file', mode: 0o666 },
    })
    const launchers = createAgentLaunchers({
      agents: [claude, acme],
      path: async () => 'C:\\Windows\\System32;C:\\Users\\ana\\AppData\\Roaming\\npm',
      platform: 'win32',
      pathext: '.EXE;.CMD',
      stat: disk.stat,
    })

    // Act
    const found = await launchers.launchable()

    // Assert
    expect(found).toEqual([claude])
  })
})

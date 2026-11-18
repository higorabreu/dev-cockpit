import { execFile, spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, lstat, mkdir, readFile, readlink, symlink } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import type { LinkState, MacFiles } from './mac.ts'
import type { CommandRunner } from './system.ts'

// No shell: arguments go to the program as they are
export const commandRunner: CommandRunner = {
  capture: (command, args) =>
    new Promise((resolve) => {
      execFile(command, [...args], { maxBuffer: 1024 * 1024 }, (error, stdout) => {
        const code = error ? (typeof error.code === 'number' ? error.code : null) : 0
        resolve({ code, stdout: String(stdout) })
      })
    }),
  interactive: (command, args) =>
    new Promise((resolve) => {
      const child = spawn(command, [...args], { stdio: 'inherit' })
      // A program that is not there never starts; the caller reports the null exit
      child.on('error', () => resolve(null))
      child.on('close', (code) => resolve(code))
    }),
}

const can = (path: string, mode: number) =>
  access(path, mode).then(
    () => true,
    () => false,
  )

export async function hasCommand(name: string, pathVariable: string): Promise<boolean> {
  for (const folder of pathVariable.split(delimiter).filter(Boolean)) {
    if (await can(join(folder, name), constants.X_OK)) return true
  }
  return false
}

async function linkState(path: string): Promise<LinkState> {
  const stats = await lstat(path).catch(() => undefined)
  if (!stats) return { kind: 'missing' }
  if (!stats.isSymbolicLink()) return { kind: 'other' }
  return { kind: 'link', target: await readlink(path) }
}

export const macFiles: MacFiles = {
  readText: (path) => readFile(path, 'utf8').catch(() => undefined),
  exists: (path) => can(path, constants.F_OK),
  writable: (folder) => can(folder, constants.W_OK),
  linkState,
  symlink: (target, path) =>
    symlink(target, path).then(
      () => true,
      () => false,
    ),
  mkdir: async (path) => {
    await mkdir(path, { recursive: true })
  },
}

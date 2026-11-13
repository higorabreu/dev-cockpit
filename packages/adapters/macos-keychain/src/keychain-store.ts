import { spawn } from 'node:child_process'
import { errorBody, fail, ok, type SecretStore } from '@dck/core'

const SERVICE = 'dev-cockpit'
const TIMEOUT_MS = 5000
// errSecItemNotFound, the exit code of find and delete when the item does not exist
const NOT_FOUND = 44

export interface ToolRun {
  // `missing` when the executable does not exist
  readonly status: number | 'missing'
  readonly stdout: string
}

export type ToolRunner = (args: readonly string[], stdin?: string) => Promise<ToolRun>

const runSecurity: ToolRunner = (args, stdin) =>
  new Promise((resolve) => {
    const child = spawn('security', [...args], {
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: TIMEOUT_MS,
    })
    let stdout = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.on('error', (error: NodeJS.ErrnoException) =>
      resolve({ status: error.code === 'ENOENT' ? 'missing' : 1, stdout: '' }),
    )
    child.on('close', (status) => resolve({ status: status ?? 1, stdout }))
    child.stdin.on('error', () => undefined)
    child.stdin.end(stdin)
  })

// `security -i` reads one command per line, where a backslash escapes the next character
const quote = (text: string) => `"${text.replace(/(["\\])/g, '\\$1')}"`

// A line break has no escape and splits the command, and `-w` prints a non-ASCII value in hex
const isPrintableAscii = (text: string) => /^[\x20-\x7e]*$/.test(text)

const item = (key: string) => ['-s', SERVICE, '-a', key]

const failure = (command: string, status: ToolRun['status']) =>
  status === 'missing'
    ? fail(errorBody('DCK-SEC-001'))
    : fail(errorBody('DCK-SEC-002', `${command} exited with ${status}`))

export function createKeychainStore(run: ToolRunner = runSecurity): SecretStore {
  return {
    async get(key) {
      const { status, stdout } = await run(['find-generic-password', ...item(key), '-w'])
      if (status === 0) return ok(stdout.replace(/\n$/, ''))
      if (status === NOT_FOUND) return ok(undefined)
      return failure('find-generic-password', status)
    },
    async set(key, value) {
      if (!isPrintableAscii(key) || !isPrintableAscii(value))
        return fail(errorBody('DCK-SEC-002', 'only printable ASCII can go through security -i'))
      // The secret goes through stdin: as an argument of add-generic-password it would show in `ps`
      const command = [
        'add-generic-password',
        '-U',
        '-l',
        quote(`Dev Cockpit: ${key}`),
        '-s',
        quote(SERVICE),
        '-a',
        quote(key),
        '-w',
        quote(value),
      ]
      const { status } = await run(['-i'], `${command.join(' ')}\n`)
      return status === 0 ? ok(undefined) : failure('add-generic-password', status)
    },
    async delete(key) {
      const { status } = await run(['delete-generic-password', ...item(key)])
      return status === 0 || status === NOT_FOUND
        ? ok(undefined)
        : failure('delete-generic-password', status)
    },
  }
}

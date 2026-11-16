import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { errorBody, fail, ok, type SecretStore } from '@dck/core'

const SERVICE = 'dev-cockpit'
const TIMEOUT_MS = 5000
// An absolute path, so the secret never reaches another `security` found earlier on PATH
const SECURITY = '/usr/bin/security'
// security -i keeps 4095 bytes of a line and runs the rest as the next command
const MAX_LINE = 4094
// Keys and the service name both go inside the security -i line and into arguments
const NAME = /^[A-Za-z0-9._:-]{1,128}$/
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
    const child = spawn(SECURITY, [...args], {
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
    // EPIPE when security exits early or is missing; the close or error handler resolves instead
    child.stdin.on('error', () => undefined)
    child.stdin.end(stdin)
  })

// `security -i` reads one command per line, where a backslash escapes the next character
const quote = (text: string) => `"${text.replace(/(["\\])/g, '\\$1')}"`

// A line break has no escape and splits the command, and `-w` prints a non-ASCII value in hex
const isPrintableAscii = (text: string) => /^[\x20-\x7e]*$/.test(text)

const failure = (command: string, status: ToolRun['status']) =>
  status === 'missing'
    ? fail(errorBody('DCK-SEC-001'))
    : fail(errorBody('DCK-SEC-002', `${command} exited with ${status}`))

export function createKeychainStore(
  options: { readonly run?: ToolRunner; readonly service?: string } = {},
): SecretStore {
  const { run = runSecurity, service = SERVICE } = options
  if (!NAME.test(service)) throw new Error(`invariant: invalid keychain service ${service}`)
  const item = (key: string) => ['-s', service, '-a', key]
  return {
    async get(key) {
      const { status, stdout } = await run(['find-generic-password', ...item(key), '-w'])
      if (status === 0) return ok(stdout.replace(/\n$/, ''))
      if (status === NOT_FOUND) return ok(undefined)
      return failure('find-generic-password', status)
    },
    async set(key, value) {
      if (!NAME.test(key) || !isPrintableAscii(value))
        return fail(errorBody('DCK-SEC-002', 'the key or the value cannot go through security -i'))
      // The secret goes through stdin: as an argument of add-generic-password it would show in `ps`
      const command = [
        'add-generic-password',
        '-U',
        '-l',
        quote(`Dev Cockpit: ${key}`),
        '-s',
        quote(service),
        '-a',
        quote(key),
        '-w',
        quote(value),
      ]
      const line = command.join(' ')
      // Counted in bytes, the unit security -i cuts at, even if the ASCII checks ever loosen
      if (Buffer.byteLength(line, 'utf8') > MAX_LINE)
        return fail(errorBody('DCK-SEC-002', `security -i line over ${MAX_LINE} bytes`))
      const { status } = await run(['-i'], `${line}\n`)
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

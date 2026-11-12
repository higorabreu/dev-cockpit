import { spawn } from 'node:child_process'
import { errorBody, fail, ok, type SecretStore } from '@dck/core'

const SERVICE = 'dev-cockpit'
const TIMEOUT_MS = 5000

export interface ToolRun {
  // `missing` quando o executável não existe
  readonly status: number | 'missing'
  readonly stdout: string
}

export type ToolRunner = (args: readonly string[], stdin?: string) => Promise<ToolRun>

// O segredo vai só pelo stdin, nunca nos argumentos (apareceriam no `ps`)
const runSecretTool: ToolRunner = (args, stdin) =>
  new Promise((resolve) => {
    const child = spawn('secret-tool', [...args], {
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

const attributes = (key: string) => ['service', SERVICE, 'key', key]

export function createSecretToolStore(run: ToolRunner = runSecretTool): SecretStore {
  return {
    async get(key) {
      const result = await run(['lookup', ...attributes(key)])
      if (result.status === 'missing') return fail(errorBody('DCK-SEC-001'))
      // O lookup sai com 1 e sem saída quando a chave não existe
      if (result.status === 1 && result.stdout === '') return ok(undefined)
      return result.status === 0
        ? ok(result.stdout)
        : fail(errorBody('DCK-SEC-002', `lookup saiu com ${result.status}`))
    },
    async set(key, value) {
      const result = await run(['store', `--label=Dev Cockpit: ${key}`, ...attributes(key)], value)
      if (result.status === 'missing') return fail(errorBody('DCK-SEC-001'))
      return result.status === 0
        ? ok(undefined)
        : fail(errorBody('DCK-SEC-002', `store saiu com ${result.status}`))
    },
    async delete(key) {
      const result = await run(['clear', ...attributes(key)])
      if (result.status === 'missing') return fail(errorBody('DCK-SEC-001'))
      return result.status === 0
        ? ok(undefined)
        : fail(errorBody('DCK-SEC-002', `clear saiu com ${result.status}`))
    },
  }
}

import { execFile } from 'node:child_process'
import { appendFile, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { connectTo, defaultEndpoint, defaultStateDir } from '@dck/adapter-node-net'
import { createJsonLogger, createTranslator, pickLocale, silentLogger } from '@dck/core'
import { createGitLabViews, startDaemon } from '@dck/daemon'
import { runCli } from './cli.ts'

const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()
const args = process.argv.slice(2)

if (args[0] === 'daemon') {
  const logger = createJsonLogger((line) => process.stderr.write(line))
  let stopDaemon = async () => process.exit(0)
  const views = createGitLabViews({
    stateDir: process.env.DCK_STATE_DIR ?? defaultStateDir(),
    logger,
    profile: process.env.DCK_PROFILE,
  })
  const started = await startDaemon({
    endpoint,
    logger,
    views,
    onShutdown: () => void stopDaemon(),
  })
  if (!started.ok) {
    logger.error('daemon did not start', { reason: started.error.message })
    process.exit(1)
  }
  logger.info('daemon started', { endpoint })
  stopDaemon = async () => {
    await started.value.stop()
    process.exit(0)
  }
  process.on('SIGINT', stopDaemon)
  process.on('SIGTERM', stopDaemon)
} else {
  // DCK_CLAUDE_SETTINGS exists to rehearse the install on a copy, without touching the real file
  const settingsPath =
    process.env.DCK_CLAUDE_SETTINGS ?? join(homedir(), '.claude', 'settings.json')
  const readStdin = async () => {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8')
  }
  const t = createTranslator(
    pickLocale([
      process.env.LC_ALL ?? '',
      process.env.LC_MESSAGES ?? '',
      process.env.LANG ?? '',
      process.env.LANGUAGE ?? '',
    ]),
  ).t
  process.exitCode = await runCli(args, {
    endpoint,
    t,
    connect: (target) => connectTo(target, silentLogger),
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    // In the package the CLI runs inside Electron: the command `install` would write would not work
    agent:
      process.env.DCK_PACKAGED === '1'
        ? undefined
        : {
            env: process.env,
            t,
            readStdin,
            forward: (command, input) =>
              new Promise((resolve) => {
                const child = execFile('sh', ['-c', command], { timeout: 5000 }, (_error, stdout) =>
                  resolve(stdout),
                )
                child.stdin?.end(input)
              }),
            settingsPath,
            home: homedir(),
            log: (line) => {
              const file = join(
                process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'),
                'dck',
                'agent-report.log',
              )
              // A failure to write the log must not get in Claude's way: it goes to stderr and moves on
              void mkdir(dirname(file), { recursive: true })
                .then(() => appendFile(file, `${line}\n`))
                .catch((error: unknown) => process.stderr.write(`dck: ${String(error)}\n`))
            },
            readSettings: (path) => readFile(path, 'utf8').catch(() => undefined),
            // Writes to a file beside it and renames, so settings.json is never left half-written
            writeSettings: async (path, text) => {
              await mkdir(dirname(path), { recursive: true })
              const temporary = `${path}.dck-tmp`
              await writeFile(temporary, text)
              await rename(temporary, path)
            },
            backup: async (path) => {
              const copy = `${path}.dck-backup`
              await copyFile(path, copy)
              return copy
            },
            confirm: async (question) => {
              const reader = createInterface({ input: process.stdin, output: process.stdout })
              const answer = await reader.question(question)
              reader.close()
              return /^(s|sim|y|yes)$/i.test(answer.trim())
            },
            commandParts: { node: process.execPath, script: fileURLToPath(import.meta.url) },
          },
  })
}

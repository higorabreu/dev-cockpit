import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { findRepositoryRoot } from '@dck/adapter-extension-files'
import {
  connectTo,
  defaultConfigDir,
  defaultEndpoint,
  defaultStateDir,
} from '@dck/adapter-node-net'
import { createJsonLogger, createTranslator, pickLocale, silentLogger } from '@dck/core'
import { createConnectorViews, startDaemon } from '@dck/daemon'
import packageJson from '../package.json' with { type: 'json' }
import { runCli } from './cli.ts'
import { createExtDeps } from './ext-deps.ts'

const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()
const args = process.argv.slice(2)

if (args[0] === 'daemon') {
  const logger = createJsonLogger((line) => process.stderr.write(line))
  let stopDaemon = async () => process.exit(0)
  const views = createConnectorViews({
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
    env: process.env,
    connect: (target) => connectTo(target, silentLogger),
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    ext: createExtDeps({
      configDir: process.env.DCK_CONFIG_DIR ?? defaultConfigDir(),
      repositoryRoot: (await findRepositoryRoot(process.cwd())) ?? process.cwd(),
      appVersion: packageJson.version,
      logger: silentLogger,
      readFile: (path) => readFile(path, 'utf8').catch(() => undefined),
      writeFile: async (path, text) => {
        const temporary = `${path}.tmp`
        return mkdir(dirname(path), { recursive: true })
          .then(() => writeFile(temporary, text))
          .then(() => rename(temporary, path))
          .then(
            () => true,
            () => false,
          )
      },
    }),
  })
}

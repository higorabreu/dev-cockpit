import { defaultEndpoint, defaultStateDir } from '@dck/adapter-node-net'
import { checkProfile, createJsonLogger } from '@dck/core'
import { createConnectorViews } from './connector-views.ts'
import { startDaemon } from './daemon.ts'
import { systemSecretStore } from './secret-store.ts'

async function main() {
  const logger = createJsonLogger((line) => process.stderr.write(line))
  const profile = checkProfile(process.env.DCK_PROFILE, logger)
  if (profile.kind === 'invalid') {
    process.exitCode = 1
    return
  }
  const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()
  const stateDir = process.env.DCK_STATE_DIR ?? defaultStateDir()

  const views = createConnectorViews({
    stateDir,
    logger,
    secrets: systemSecretStore(),
    profile: profile.profile,
  })

  let stopDaemon = async () => process.exit(0)
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
}

void main()

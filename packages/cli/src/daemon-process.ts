import { defaultStateDir } from '@dck/adapter-node-net'
import { checkProfile, createJsonLogger } from '@dck/core'
import { createConnectorViews, startDaemon } from '@dck/daemon'
import { systemSecretStore } from '@dck/daemon/secret-store'

// `dck daemon`: runs the daemon in this process until SIGINT or SIGTERM
export async function runDaemonProcess(endpoint: string): Promise<void> {
  const logger = createJsonLogger((line) => process.stderr.write(line))
  const profile = checkProfile(process.env.DCK_PROFILE, logger)
  if (profile.kind === 'invalid') {
    process.exitCode = 1
    return
  }
  let stopDaemon = async () => process.exit(0)
  const views = createConnectorViews({
    stateDir: process.env.DCK_STATE_DIR ?? defaultStateDir(),
    logger,
    secrets: systemSecretStore(),
    profile: profile.profile,
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
}

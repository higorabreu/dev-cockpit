import { defaultEndpoint, defaultStateDir } from '@dck/adapter-node-net'
import { createJsonLogger } from '@dck/core'
import { startDaemon } from './daemon.ts'
import { createGitLabViews } from './gitlab-views.ts'

async function main() {
  const logger = createJsonLogger((line) => process.stderr.write(line))
  const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()
  const stateDir = process.env.DCK_STATE_DIR ?? defaultStateDir()

  const views = createGitLabViews({ stateDir, logger })

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

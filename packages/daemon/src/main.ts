import { defaultEndpoint } from '@dck/adapter-node-net'
import { createJsonLogger } from '@dck/core'
import { startDaemon } from './daemon.ts'

async function main() {
  const logger = createJsonLogger((line) => process.stderr.write(line))
  const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()

  let stopDaemon = async () => process.exit(0)
  const started = await startDaemon({ endpoint, logger, onShutdown: () => void stopDaemon() })
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

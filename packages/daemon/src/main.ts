import { defaultEndpoint } from '@dck/adapter-node-net'
import { createJsonLogger } from '@dck/core'
import { startDaemon } from './daemon.ts'

async function main() {
  const logger = createJsonLogger((line) => process.stderr.write(line))
  const endpoint = process.env.DCK_ENDPOINT ?? defaultEndpoint()

  const started = await startDaemon({ endpoint, logger })
  if (!started.ok) {
    logger.error('daemon did not start', { reason: started.error.message })
    process.exit(1)
  }

  logger.info('daemon started', { endpoint })
  const stop = async () => {
    await started.value.stop()
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

void main()

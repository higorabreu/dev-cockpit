import {
  agentSignalSchema,
  createClient,
  type ErrorBody,
  type Result,
  type Transport,
} from '@dck/core'

export interface SignalDeps {
  readonly endpoint: string
  readonly env: Readonly<Record<string, string | undefined>>
  connect(endpoint: string): Promise<Result<Transport, ErrorBody>>
  readonly timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 1000

// An agent's hooks run this on every event: it never fails, prints nothing and gives up quickly
export async function signalAgent(args: readonly string[], deps: SignalDeps): Promise<void> {
  const ptyId = deps.env.DCK_PTY_ID
  const parsed = agentSignalSchema.safeParse({
    ptyId: ptyId ? Number(ptyId) : undefined,
    state: args[0],
  })
  // Outside a cockpit terminal or with an unknown state there is no tab to tell
  if (!parsed.success || args.length !== 1) return
  const connected = await deps.connect(deps.endpoint)
  // Without a daemon the cockpit is closed: the normal case, not an error
  if (!connected.ok) return
  const client = createClient(connected.value)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      client.request('agent.signal', parsed.data),
      new Promise((resolve) => {
        timer = setTimeout(resolve, deps.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
    client.close()
  }
}

import { z } from 'zod'

// The only states the cockpit knows about any coding agent; each agent maps its own events to them
export const agentStates = ['working', 'needs-you', 'your-turn', 'ended'] as const

export type AgentState = (typeof agentStates)[number]

// What `dck agent signal` sends through the daemon to the window, validated at each edge
export const agentSignalSchema = z.object({
  ptyId: z.number().int().nonnegative(),
  state: z.enum(agentStates),
})

export type AgentSignal = z.infer<typeof agentSignalSchema>

// zod/mini: coding agents' hooks load this through `dck agent signal` on every event, where the classic
// zod build alone takes about 25 ms to load
import * as z from 'zod/mini'

// The only states the cockpit knows about any coding agent; each agent maps its own events to them
export const agentStates = ['working', 'needs-you', 'your-turn', 'ended'] as const

export type AgentState = (typeof agentStates)[number]

// What `dck agent signal` sends through the daemon to the window, validated at each edge
export const agentSignalSchema = z.object({
  ptyId: z.int().check(z.nonnegative()),
  state: z.enum(agentStates),
})

export type AgentSignal = z.infer<typeof agentSignalSchema>

import { z } from 'zod'

export interface TranscriptSummary {
  readonly model?: string
  readonly contextTokens?: number
  readonly lastResponseAt?: number
  readonly title?: string
  readonly permissionMode?: string
}

const number = z.number().nonnegative().optional()

const assistantLine = z.object({
  type: z.literal('assistant'),
  isSidechain: z.boolean().optional(),
  timestamp: z.string().optional(),
  message: z.object({
    model: z.string().optional(),
    usage: z
      .object({
        input_tokens: number,
        cache_creation_input_tokens: number,
        cache_read_input_tokens: number,
      })
      .optional(),
  }),
})
const titleLine = z.object({ type: z.literal('ai-title'), aiTitle: z.string() })
const modeLine = z.object({ type: z.literal('permission-mode'), permissionMode: z.string() })

function parse(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

// Reads the tail of a Claude Code session file, newest to oldest, and keeps only
// what the screen uses: never stores or forwards the conversation content
export function summarizeTranscriptTail(text: string): TranscriptSummary {
  let model: string | undefined
  let contextTokens: number | undefined
  let lastResponseAt: number | undefined
  let title: string | undefined
  let permissionMode: string | undefined

  const lines = text.split('\n')
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index] ?? ''
    // Huge lines of other types (request bodies) need not even be read as JSON
    const wanted =
      line.includes('"type":"assistant"') ||
      line.includes('"type":"ai-title"') ||
      line.includes('"type":"permission-mode"')
    if (!wanted) continue
    const value = parse(line)

    const assistant = assistantLine.safeParse(value)
    if (assistant.success && contextTokens === undefined) {
      const { message, isSidechain, timestamp } = assistant.data
      const usage = message.usage
      // Subagent and synthetic responses do not tell the main conversation's context
      if (!isSidechain && usage && message.model !== '<synthetic>') {
        model = message.model
        contextTokens =
          (usage.input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0)
        const at = timestamp ? Date.parse(timestamp) : Number.NaN
        lastResponseAt = Number.isNaN(at) ? undefined : at
      }
      continue
    }
    const aiTitle = titleLine.safeParse(value)
    if (aiTitle.success && title === undefined) {
      title = aiTitle.data.aiTitle
      continue
    }
    const mode = modeLine.safeParse(value)
    if (mode.success && permissionMode === undefined) permissionMode = mode.data.permissionMode
    if (contextTokens !== undefined && title !== undefined && permissionMode !== undefined) break
  }

  return {
    ...(model ? { model } : {}),
    ...(contextTokens !== undefined ? { contextTokens } : {}),
    ...(lastResponseAt !== undefined ? { lastResponseAt } : {}),
    ...(title ? { title } : {}),
    ...(permissionMode ? { permissionMode } : {}),
  }
}

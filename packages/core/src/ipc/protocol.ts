import { z } from 'zod'
import { describeError, type ErrorCode } from '../errors.ts'
import { fail, ok, type Result } from '../result.ts'

const requestSchema = z.object({
  id: z.number().int(),
  method: z.string().min(1),
  params: z.unknown().optional(),
})

const errorBodySchema = z.object({ code: z.string(), message: z.string() })

const responseSchema = z.union([
  z.object({ id: z.number().int(), result: z.unknown() }),
  z.object({ id: z.number().int(), error: errorBodySchema }),
])

const eventSchema = z.object({ event: z.string().min(1), data: z.unknown().optional() })

const messageSchema = z.union([requestSchema, responseSchema, eventSchema])

export type Request = z.infer<typeof requestSchema>
export type ErrorBody = z.infer<typeof errorBodySchema>
export type Response = z.infer<typeof responseSchema>
export type EventMessage = z.infer<typeof eventSchema>
export type Message = Request | Response | EventMessage

export const isRequest = (message: Message): message is Request => 'method' in message
export const isEvent = (message: Message): message is EventMessage => 'event' in message
export const isResponse = (message: Message): message is Response =>
  'id' in message && !('method' in message)

export const errorBody = (code: ErrorCode, detail?: string): ErrorBody => ({
  code,
  message: detail ? `${describeError(code)}: ${detail}` : describeError(code),
})

export function encode(message: Message): string {
  return `${JSON.stringify(message)}\n`
}

function parseLine(line: string): Result<Message, ErrorBody> {
  let json: unknown
  try {
    json = JSON.parse(line)
  } catch {
    return fail(errorBody('DCK-IPC-004', 'JSON inválido'))
  }
  const parsed = messageSchema.safeParse(json)
  return parsed.success ? ok(parsed.data) : fail(errorBody('DCK-IPC-004'))
}

// Mensagens são JSON em linhas; um pedaço pode chegar partido no meio de uma linha
export class LineDecoder {
  private buffer = ''

  push(chunk: string): Result<Message, ErrorBody>[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    return lines.filter((line) => line.trim() !== '').map(parseLine)
  }
}

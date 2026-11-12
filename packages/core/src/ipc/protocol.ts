import { z } from 'zod'
import { type ErrorCode, errorInfo } from '../errors.ts'
import { fail, ok, type Result } from '../result.ts'

// JSON-RPC 2.0: https://www.jsonrpc.org/specification
const version = z.literal('2.0')
const id = z.number().int()

const requestSchema = z.object({
  jsonrpc: version,
  id,
  method: z.string().min(1),
  params: z.unknown().optional(),
})

const notificationSchema = z.object({
  jsonrpc: version,
  method: z.string().min(1),
  params: z.unknown().optional(),
})

const errorBodySchema = z.object({
  code: z.number().int(),
  message: z.string(),
  data: z
    .object({
      code: z.string(),
      category: z.string().optional(),
      retryable: z.boolean().optional(),
    })
    .optional(),
})

const responseSchema = z.union([
  z.object({ jsonrpc: version, id, result: z.unknown() }),
  z.object({ jsonrpc: version, id, error: errorBodySchema }),
])

const messageSchema = z.union([requestSchema, notificationSchema, responseSchema])

export type Request = z.infer<typeof requestSchema>
export type Notification = z.infer<typeof notificationSchema>
export type ErrorBody = z.infer<typeof errorBodySchema>
export type Response = z.infer<typeof responseSchema>
export type Message = Request | Notification | Response

export const isRequest = (message: Message): message is Request =>
  'method' in message && 'id' in message
export const isNotification = (message: Message): message is Notification =>
  'method' in message && !('id' in message)
export const isResponse = (message: Message): message is Response => !('method' in message)

export function errorBody(code: ErrorCode, detail?: string): ErrorBody {
  const info = errorInfo(code)
  return {
    code: info.rpc,
    message: detail ? `${info.message}: ${detail}` : info.message,
    data: { code, category: info.category, retryable: info.retryable },
  }
}

export function encode(message: Message): string {
  return `${JSON.stringify(message)}\n`
}

function parseLine(line: string): Result<Message, ErrorBody> {
  let json: unknown
  try {
    json = JSON.parse(line)
  } catch {
    return fail(errorBody('DCK-IPC-004', 'invalid JSON'))
  }
  const parsed = messageSchema.safeParse(json)
  return parsed.success ? ok(parsed.data) : fail(errorBody('DCK-IPC-004'))
}

// Messages are line-delimited JSON; a chunk may arrive split in the middle of a line
export class LineDecoder {
  private buffer = ''

  push(chunk: string): Result<Message, ErrorBody>[] {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    return lines.filter((line) => line.trim() !== '').map(parseLine)
  }
}

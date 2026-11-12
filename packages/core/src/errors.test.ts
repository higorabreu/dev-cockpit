import { describe, expect, it } from 'vitest'
import { errorCodeOf } from './errors.ts'
import { errorBody } from './ipc/protocol.ts'

describe('errorCodeOf', () => {
  it('should return the registered code when the body carries it', () => {
    expect(errorCodeOf(errorBody('DCK-NET-001'))).toBe('DCK-NET-001')
  })

  it('should return the internal error code when the body has no known code', () => {
    expect(errorCodeOf({})).toBe('DCK-IPC-002')
    expect(errorCodeOf({ data: { code: 'DCK-XXX-999' } })).toBe('DCK-IPC-002')
  })
})

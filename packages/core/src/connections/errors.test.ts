import { describe, expect, it } from 'vitest'
import { connectionErrorKey } from './errors.ts'

describe('connectionErrorKey', () => {
  it('should give a connector code its own connection text when the catalogs have one', () => {
    expect(connectionErrorKey('DCK-GLB-001')).toBe('connections.error.DCK-GLB-001')
    expect(connectionErrorKey('DCK-SEC-001')).toBe('connections.error.DCK-SEC-001')
  })

  it('should fall back to the generic text when the code has no connection text', () => {
    expect(connectionErrorKey('DCK-IPC-002')).toBe('connections.error.unknown')
  })
})

import type { ErrorCode } from '../errors.ts'
import type { MessageKey } from '../i18n/pt-BR.ts'

const KEYS: Partial<Record<ErrorCode, MessageKey>> = {
  'DCK-GLB-001': 'connections.error.DCK-GLB-001',
  'DCK-GLB-002': 'connections.error.DCK-GLB-002',
  'DCK-GLB-003': 'connections.error.DCK-GLB-003',
  'DCK-GLB-004': 'connections.error.DCK-GLB-004',
  'DCK-GLB-005': 'connections.error.DCK-GLB-005',
  'DCK-GLB-006': 'connections.error.DCK-GLB-006',
  'DCK-NET-001': 'connections.error.DCK-NET-001',
  'DCK-SEC-001': 'connections.error.DCK-SEC-001',
  'DCK-SEC-002': 'connections.error.DCK-SEC-002',
}

export const connectionErrorKey = (code: ErrorCode): MessageKey =>
  KEYS[code] ?? 'connections.error.unknown'

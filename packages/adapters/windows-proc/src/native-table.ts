import type { ProcessEntry, ProcessTable } from './process-table.ts'

type Koffi = typeof import('koffi')

const TH32CS_SNAPPROCESS = 0x2
const INVALID_HANDLE = -1n
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
// NtQueryInformationProcess class that answers the command line as a UNICODE_STRING (Windows 8.1 on)
const PROCESS_COMMAND_LINE_INFORMATION = 60
const COMMAND_LINE_BYTES = 32 * 1024

// The Win32 calls the table needs, bound once on the first read
function bind(koffi: Koffi) {
  const kernel32 = koffi.load('kernel32.dll')
  const ntdll = koffi.load('ntdll.dll')
  const entry = koffi.struct('PROCESSENTRY32W', {
    dwSize: 'uint32',
    cntUsage: 'uint32',
    th32ProcessID: 'uint32',
    th32DefaultHeapID: 'uintptr',
    th32ModuleID: 'uint32',
    cntThreads: 'uint32',
    th32ParentProcessID: 'uint32',
    pcPriClassBase: 'int32',
    dwFlags: 'uint32',
    szExeFile: koffi.array('char16', 260, 'String'),
  })
  return {
    entrySize: koffi.sizeof(entry),
    snapshot: kernel32.func('intptr __stdcall CreateToolhelp32Snapshot(uint32, uint32)'),
    first: kernel32.func('bool __stdcall Process32FirstW(intptr, _Inout_ PROCESSENTRY32W *)'),
    next: kernel32.func('bool __stdcall Process32NextW(intptr, _Inout_ PROCESSENTRY32W *)'),
    open: kernel32.func('intptr __stdcall OpenProcess(uint32, bool, uint32)'),
    close: kernel32.func('bool __stdcall CloseHandle(intptr)'),
    times: kernel32.func(
      'bool __stdcall GetProcessTimes(intptr, _Out_ uint64 *, _Out_ uint64 *, _Out_ uint64 *, _Out_ uint64 *)',
    ),
    query: ntdll.func(
      'int32 __stdcall NtQueryInformationProcess(intptr, int32, _Out_ uint8 *, uint32, _Out_ uint32 *)',
    ),
  }
}

type Bound = ReturnType<typeof bind>

function withProcess<T>(api: Bound, pid: number, read: (handle: number | bigint) => T) {
  const handle = api.open(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
  if (!handle) return undefined
  try {
    return read(handle)
  } finally {
    api.close(handle)
  }
}

// A UNICODE_STRING (two lengths, padding, a pointer) heads the buffer and points into it
const commandLineOf = (buffer: Buffer) => {
  const length = buffer.readUInt16LE(0)
  const start = process.arch === 'ia32' ? 8 : 16
  return buffer.subarray(start, start + length).toString('utf16le')
}

export function createNativeTable(
  load: () => Promise<Koffi> = () => import('koffi'),
): ProcessTable {
  let bound: Promise<Bound> | undefined
  const api = () => {
    bound ??= load().then((module) =>
      bind((module as unknown as { default?: Koffi }).default ?? module),
    )
    return bound
  }

  return {
    async list() {
      const native = await api()
      const handle = native.snapshot(TH32CS_SNAPPROCESS, 0)
      if (BigInt(handle) === INVALID_HANDLE) return []
      const entries: ProcessEntry[] = []
      try {
        const entry = { dwSize: native.entrySize } as Record<string, unknown>
        for (let more = native.first(handle, entry); more; more = native.next(handle, entry))
          entries.push({
            pid: Number(entry.th32ProcessID),
            parent: Number(entry.th32ParentProcessID),
            name: String(entry.szExeFile),
          })
      } finally {
        native.close(handle)
      }
      return entries
    },
    async createdAt(pid) {
      const native = await api()
      return withProcess(native, pid, (handle) => {
        const created = [0n]
        const ignored = [0n]
        return native.times(handle, created, ignored, ignored, ignored)
          ? BigInt(created[0] ?? 0n)
          : undefined
      })
    },
    async commandLine(pid) {
      const native = await api()
      return withProcess(native, pid, (handle) => {
        const buffer = Buffer.alloc(COMMAND_LINE_BYTES)
        const status = native.query(
          handle,
          PROCESS_COMMAND_LINE_INFORMATION,
          buffer,
          buffer.length,
          [0],
        )
        return status === 0 ? commandLineOf(buffer) : undefined
      })
    },
  }
}

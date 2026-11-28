export interface ProcessEntry {
  readonly pid: number
  readonly parent: number
  // Executable file name, `.exe` included, as Windows records it
  readonly name: string
}

// What the inspector reads from Windows; undefined when the process is gone or not ours to open
export interface ProcessTable {
  list(): Promise<readonly ProcessEntry[]>
  // FILETIME of the start, to order siblings and to tell a reused pid from its old parent
  createdAt(pid: number): Promise<bigint | undefined>
  commandLine(pid: number): Promise<string | undefined>
}

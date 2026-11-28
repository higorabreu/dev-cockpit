// OSC 7 (`ESC ] 7 ; file://host/path`, ended by BEL or ESC \): the shell reporting its directory at each prompt
const START = '\x1b]7;'
// A report longer than this never ends: a stray start, not a path
const MAX_REPORT = 4096

// Percent escapes as the URL standard writes them; a shell that prints the raw path keeps a `%` that
// escapes nothing as it is
const decodePath = (path: string) => {
  try {
    return decodeURIComponent(path)
  } catch {
    // Not every `%` starts an escape in a raw path: the path is taken as written
    return path
  }
}

// `/C:/Users/ana` from PowerShell, `/C:\Users\ana` from cmd and `/c/Users/ana` from Git Bash all name
// C:\Users\ana; an MSYS folder like `/usr/bin` or a share has no drive and is left out
function windowsPath(path: string): string | undefined {
  const drive = /^\/([a-zA-Z]):?(?=[\\/]|$)(.*)$/.exec(path)
  if (!drive) return undefined
  const rest = (drive[2] ?? '').replace(/\//g, '\\').replace(/\\+$/, '')
  return `${drive[1]?.toUpperCase()}:${rest || '\\'}`
}

export function directoryOfReport(report: string, platform: 'win32' | 'posix'): string | undefined {
  const url = /^file:\/\/[^/]*(\/.*)$/.exec(report)
  if (!url?.[1]) return undefined
  const path = decodePath(url[1])
  return platform === 'win32' ? windowsPath(path) : path
}

// Reads the directory reports out of a terminal's output, chunk by chunk: a report may be cut between two
export function createDirectoryReader(platform: 'win32' | 'posix') {
  let pending = ''
  return {
    // The last directory reported in this chunk, or undefined when it reports none
    feed(chunk: string): string | undefined {
      const text = pending + chunk
      pending = ''
      let directory: string | undefined
      let at = text.indexOf(START)
      while (at >= 0) {
        const from = at + START.length
        const bell = text.indexOf('\x07', from)
        const terminator = text.indexOf('\x1b\\', from)
        const end = bell < 0 ? terminator : terminator < 0 ? bell : Math.min(bell, terminator)
        if (end < 0) {
          if (text.length - at <= MAX_REPORT) pending = text.slice(at)
          return directory
        }
        directory = directoryOfReport(text.slice(from, end), platform) ?? directory
        at = text.indexOf(START, end)
      }
      // The chunk may end in the first bytes of a start
      for (let length = START.length - 1; length > 0; length--)
        if (text.endsWith(START.slice(0, length))) {
          pending = START.slice(0, length)
          break
        }
      return directory
    },
  }
}

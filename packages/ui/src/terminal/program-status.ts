import {
  PROGRAM_STATUS_OSC,
  PROGRAM_STATUS_QUERY,
  PROGRAM_STATUS_REPLY,
  type ProgramStatus,
  readProgramStatus,
} from '@dck/core'

// The part of xterm's parser this needs, so a test can pass its own
export interface OscParser {
  registerOscHandler(ident: number, callback: (data: string) => boolean): { dispose(): void }
}

export interface ProgramStatusOptions {
  // Written back to the program, as the terminal's answer
  reply(data: string): void
  report(status: ProgramStatus): void
}

// What a program in this terminal reports about itself (OSC 7501), whichever program it is
export function attachProgramStatus(parser: OscParser, options: ProgramStatusOptions) {
  return parser.registerOscHandler(PROGRAM_STATUS_OSC, (data) => {
    if (data === PROGRAM_STATUS_QUERY) {
      options.reply(PROGRAM_STATUS_REPLY)
    } else {
      const status = readProgramStatus(data)
      if (status) options.report(status)
    }
    // Handled even when ignored, so xterm prints nothing
    return true
  })
}

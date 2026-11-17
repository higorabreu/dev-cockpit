import { describe, expect, it } from 'vitest'
import { PROGRAM_STATUS_REPLY, readProgramStatus } from './program-status.ts'

// The bodies Codex 0.169.0 writes (codex-rs/tui/src/terminal_program_status.rs), seen in a real run
const codex = {
  idle: 'state=idle:app=codex',
  working: 'state=working:app=codex',
  permission: 'state=blocked:app=codex:kind=permission',
  question: 'state=blocked:app=codex:kind=question',
  auth: 'state=blocked:app=codex:kind=auth',
  done: 'state=done:app=codex',
  error: 'state=error:app=codex',
  clear: 'state=clear',
}

describe('readProgramStatus', () => {
  it('should read working when the program reports it works', () => {
    expect(readProgramStatus(codex.working)).toBe('working')
  })

  it('should read needs you when the program is blocked on the user, whatever the reason', () => {
    const states = [codex.permission, codex.question, codex.auth].map(readProgramStatus)

    expect(states).toEqual(['needs-you', 'needs-you', 'needs-you'])
  })

  it('should read your turn when the program finished, with an answer or an error', () => {
    expect(readProgramStatus(codex.done)).toBe('your-turn')
    expect(readProgramStatus(codex.error)).toBe('your-turn')
  })

  it('should read idle when the program rests, as after the user interrupts it', () => {
    expect(readProgramStatus(codex.idle)).toBe('idle')
  })

  it('should read ended when the program clears its record on exit', () => {
    expect(readProgramStatus(codex.clear)).toBe('ended')
  })

  it('should ignore a child record when the report carries an id', () => {
    expect(readProgramStatus('state=blocked:id=subagent-1:kind=permission')).toBeUndefined()
    expect(readProgramStatus('state=clear:id=subagent-1')).toBeUndefined()
  })

  it('should ignore the report when its state is missing or unknown', () => {
    const reports = ['app=codex', 'state=sleeping:app=codex', 'state=', '', '?', 'garbage']

    expect(reports.map(readProgramStatus)).toEqual(reports.map(() => undefined))
  })

  it('should skip malformed pairs and keep the last value when a key repeats', () => {
    expect(readProgramStatus('nonsense:=x:state=working:app=codex:state=done')).toBe('your-turn')
  })

  it('should ignore keys it does not use when the report carries a message or progress', () => {
    expect(readProgramStatus('state=working:app=brew:progress=40:msg=SW5zdGFsbGluZw==')).toBe(
      'working',
    )
  })

  it('should answer a query with the same mark terminated by ST when asked for support', () => {
    expect(PROGRAM_STATUS_REPLY).toBe('\x1b]7501;?\x1b\\')
  })
})

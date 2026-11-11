import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentContext } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClaudeSource, projectDirectoryName } from './claude-source.ts'

let claudeDir = ''

beforeEach(async () => {
  claudeDir = await mkdtemp(join(tmpdir(), 'dck-claude-'))
})

afterEach(() => rm(claudeDir, { recursive: true, force: true }))

const response = (tokens: number) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-11T20:00:00.000Z',
    message: {
      model: 'claude-sonnet-5-5',
      usage: { input_tokens: tokens, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  })

async function registry(pid: number, sessionId: string, cwd: string, procStart = '100') {
  await mkdir(join(claudeDir, 'sessions'), { recursive: true })
  await writeFile(
    join(claudeDir, 'sessions', `${pid}.json`),
    JSON.stringify({ pid, sessionId, cwd, procStart, status: 'idle' }),
  )
}

async function transcript(cwd: string, sessionId: string, lines: string[]) {
  const directory = join(claudeDir, 'projects', projectDirectoryName(cwd))
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, `${sessionId}.jsonl`), `${lines.join('\n')}\n`)
}

const read = (context: AgentContext) => createClaudeSource({ claudeDir }).read(context)

describe('projectDirectoryName', () => {
  it('should replace every character that is not a letter or digit with a hyphen', () => {
    expect(projectDirectoryName('/home/ana/projects/shop/shop-compose')).toBe(
      '-home-ana-projects-shop-shop-compose',
    )
    expect(projectDirectoryName('/home/ana/.claude/jobs')).toBe('-home-ana--claude-jobs')
  })
})

describe('createClaudeSource', () => {
  it('should read the transcript of the session registered for the process when the pid matches', async () => {
    await registry(10, 'session-a', '/p/app')
    await transcript('/p/app', 'session-a', [response(222)])

    const session = await read({ cwd: '/p/app', pid: 10, processStart: '100' })

    expect(session?.contextTokens).toBe(222)
    expect(session?.agent.id).toBe('claude')
  })

  it('should read its own session and not the other one when two sessions share a directory', async () => {
    await registry(10, 'session-a', '/p/app')
    await registry(11, 'session-b', '/p/app', '200')
    await transcript('/p/app', 'session-a', [response(111)])
    await transcript('/p/app', 'session-b', [response(999)])

    const mine = await read({ cwd: '/p/app', pid: 10, processStart: '100' })
    const other = await read({ cwd: '/p/app', pid: 11, processStart: '200' })

    expect(mine?.contextTokens).toBe(111)
    expect(other?.contextTokens).toBe(999)
  })

  it('should return the session without data when the transcript does not exist yet', async () => {
    await registry(10, 'fresh', '/p/app')
    await transcript('/p/app', 'another-session', [response(555)])

    const session = await read({ cwd: '/p/app', pid: 10, processStart: '100' })

    expect(session?.agent.id).toBe('claude')
    expect(session?.contextTokens).toBeUndefined()
  })

  it('should be undefined when the registry belongs to a process that reused the pid', async () => {
    await registry(10, 'session-a', '/p/app', '100')
    await transcript('/p/app', 'session-a', [response(1)])

    expect(await read({ cwd: '/p/app', pid: 10, processStart: '777' })).toBeUndefined()
  })

  it('should be undefined when the pid is unknown or has no registry', async () => {
    expect(await read({ cwd: '/p/app' })).toBeUndefined()
    expect(await read({ cwd: '/p/app', pid: 42 })).toBeUndefined()
  })

  it('should be undefined when the registry file is malformed', async () => {
    await mkdir(join(claudeDir, 'sessions'), { recursive: true })
    await writeFile(join(claudeDir, 'sessions', '10.json'), '{ nope')

    expect(await read({ cwd: '/p/app', pid: 10 })).toBeUndefined()
  })

  it('should use the directory the session started in when it differs from the tab directory', async () => {
    await registry(10, 'session-a', '/p/app')
    await transcript('/p/app', 'session-a', [response(321)])

    const session = await read({ cwd: '/p/app/backend', pid: 10, processStart: '100' })

    expect(session?.contextTokens).toBe(321)
  })

  it('should find the response even when the end of the file is full of unrelated huge lines', async () => {
    const huge = JSON.stringify({ type: 'api-request-blob', message: 'x'.repeat(600 * 1024) })
    await registry(10, 'big', '/p/app')
    await transcript('/p/app', 'big', [response(333), huge, huge])

    expect((await read({ cwd: '/p/app', pid: 10, processStart: '100' }))?.contextTokens).toBe(333)
  })

  it('should expose the permission mode as a detail when the transcript has one', async () => {
    await registry(10, 's', '/p/app')
    await transcript('/p/app', 's', [
      response(1),
      JSON.stringify({ type: 'permission-mode', permissionMode: 'plan' }),
    ])

    const session = await read({ cwd: '/p/app', pid: 10, processStart: '100' })

    expect(session?.details).toEqual([{ id: 'permissionMode', value: 'plan' }])
  })

  it('should read the transcript the agent reported when it is inside the projects folder', async () => {
    await transcript('/p/other', 'shown', [response(444)])
    const path = join(claudeDir, 'projects', projectDirectoryName('/p/other'), 'shown.jsonl')

    const session = await read({ cwd: '/p/app', transcriptPath: path })

    expect(session?.contextTokens).toBe(444)
  })

  it('should prefer the reported transcript to the one of the process registry', async () => {
    await registry(10, 'registered', '/p/app')
    await transcript('/p/app', 'registered', [response(111)])
    await transcript('/p/app/sub', 'shown', [response(777)])
    const path = join(claudeDir, 'projects', projectDirectoryName('/p/app/sub'), 'shown.jsonl')

    const session = await read({
      cwd: '/p/app',
      pid: 10,
      processStart: '100',
      transcriptPath: path,
    })

    expect(session?.contextTokens).toBe(777)
  })

  it('should ignore a reported path outside the projects folder and use the registry instead', async () => {
    await registry(10, 'registered', '/p/app')
    await transcript('/p/app', 'registered', [response(111)])
    const outside = join(claudeDir, 'settings.json')
    await writeFile(outside, response(999))

    const session = await read({
      cwd: '/p/app',
      pid: 10,
      processStart: '100',
      transcriptPath: outside,
    })

    expect(session?.contextTokens).toBe(111)
  })

  it('should ignore a reported path that tries to climb out of the projects folder', async () => {
    const sneaky = join(claudeDir, 'projects', '..', 'secret.jsonl')
    await writeFile(join(claudeDir, 'secret.jsonl'), response(555))

    expect(await read({ cwd: '/p/app', transcriptPath: sneaky })).toBeUndefined()
  })
})

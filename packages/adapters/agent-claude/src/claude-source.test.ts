import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClaudeSource, projectDirectoryName } from './claude-source.ts'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dck-claude-'))
})

afterEach(() => rm(root, { recursive: true, force: true }))

const response = (tokens: number) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-11T20:00:00.000Z',
    message: {
      model: 'claude-sonnet-5-5',
      usage: { input_tokens: tokens, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  })

async function transcript(cwd: string, name: string, lines: string[], ageSeconds = 0) {
  const directory = join(root, projectDirectoryName(cwd))
  await mkdir(directory, { recursive: true })
  const file = join(directory, name)
  await writeFile(file, `${lines.join('\n')}\n`)
  const when = new Date(Date.now() - ageSeconds * 1000)
  await utimes(file, when, when)
}

describe('projectDirectoryName', () => {
  it('should replace every character that is not a letter or digit with a hyphen', () => {
    expect(projectDirectoryName('/home/ana/projects/shop/shop-compose')).toBe(
      '-home-ana-projects-shop-shop-compose',
    )
    expect(projectDirectoryName('/home/ana/.claude/jobs')).toBe('-home-ana--claude-jobs')
  })
})

describe('createClaudeSource', () => {
  it('should read the context of the newest transcript when the project has several', async () => {
    await transcript('/p/app', 'old.jsonl', [response(111)], 600)
    await transcript('/p/app', 'new.jsonl', [response(222)], 5)

    const session = await createClaudeSource({ projectsRoot: root }).read('/p/app')

    expect(session?.contextTokens).toBe(222)
    expect(session?.agent.id).toBe('claude')
  })

  it('should be undefined when the project has no transcript', async () => {
    expect(await createClaudeSource({ projectsRoot: root }).read('/p/none')).toBeUndefined()
  })

  it('should find the response even when the end of the file is full of unrelated huge lines', async () => {
    const huge = JSON.stringify({ type: 'api-request-blob', message: 'x'.repeat(600 * 1024) })
    await transcript('/p/app', 's.jsonl', [response(333), huge, huge])

    const session = await createClaudeSource({ projectsRoot: root }).read('/p/app')

    expect(session?.contextTokens).toBe(333)
  })

  it('should expose the permission mode as a detail when the transcript has one', async () => {
    await transcript('/p/app', 's.jsonl', [
      response(1),
      JSON.stringify({ type: 'permission-mode', permissionMode: 'plan' }),
    ])

    const session = await createClaudeSource({ projectsRoot: root }).read('/p/app')

    expect(session?.details).toEqual([{ id: 'permissionMode', value: 'plan' }])
  })
})

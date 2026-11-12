import { open, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import type { AgentContext, AgentProfile, AgentSession, AgentSource } from '@dck/core'
import { z } from 'zod'
import { normalizeStatusline } from './statusline.ts'
import { summarizeTranscriptTail } from './transcript.ts'

export const claudeProfile: AgentProfile = {
  id: 'claude',
  name: 'Claude',
  processes: ['claude'],
}

// Sizes of the tail read of the file: grows only if the chunk has no response with usage
const TAIL_STEPS = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024]

// Claude Code writes sessions in ~/.claude/projects/<directory with everything that is not a letter
// or digit replaced by a hyphen>/<id>.jsonl
export function projectDirectoryName(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-')
}

async function readTail(path: string, bytes: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(bytes, size)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    const text = buffer.toString('utf8')
    // Starting mid-file cuts the first line; it is discarded
    return length < size ? text.slice(text.indexOf('\n') + 1) : text
  } finally {
    await handle.close()
  }
}

export interface ClaudeSourceOptions {
  // Claude Code configuration folder, normally ~/.claude
  readonly claudeDir?: string
}

// Claude Code records each live process in ~/.claude/sessions/<pid>.json
const registryEntry = z.object({
  sessionId: z.string().min(1),
  cwd: z.string(),
  procStart: z.string().optional(),
})

async function readRegistry(claudeDir: string, pid: number) {
  const text = await readFile(join(claudeDir, 'sessions', `${pid}.json`), 'utf8').catch(
    () => undefined,
  )
  if (text === undefined) return undefined
  try {
    const parsed = registryEntry.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

// Only reads session files inside Claude's projects folder: the path comes from an
// external process and must not point to just any file
function insideProjects(claudeDir: string, path: string): boolean {
  const root = `${resolve(claudeDir, 'projects')}${sep}`
  const resolved = resolve(path)
  return resolved.startsWith(root) && resolved.endsWith('.jsonl')
}

// What Claude itself reported (statusLine) wins; without it, the process record
async function transcriptFor(
  claudeDir: string,
  context: AgentContext,
): Promise<string | undefined> {
  if (context.transcriptPath && insideProjects(claudeDir, context.transcriptPath)) {
    return resolve(context.transcriptPath)
  }
  // Without the exact process there is no way to tell which session it is: better nothing than the wrong session
  if (context.pid === undefined) return undefined
  const entry = await readRegistry(claudeDir, context.pid)
  if (!entry) return undefined
  // The process start must match, otherwise the record belongs to a reused PID
  if (context.processStart && entry.procStart && entry.procStart !== context.processStart) {
    return undefined
  }
  return join(claudeDir, 'projects', projectDirectoryName(entry.cwd), `${entry.sessionId}.jsonl`)
}

export function createClaudeSource(options: ClaudeSourceOptions = {}): AgentSource {
  const claudeDir = options.claudeDir ?? join(homedir(), '.claude')

  return {
    profile: claudeProfile,
    report: normalizeStatusline,
    async read(context): Promise<AgentSession | undefined> {
      const file = await transcriptFor(claudeDir, context)
      if (!file) return undefined
      let summary = summarizeTranscriptTail('')
      for (const bytes of TAIL_STEPS) {
        const text = await readTail(file, bytes).catch(() => undefined)
        // The session has not written anything yet (before the first message the file does not exist)
        if (text === undefined) break
        summary = summarizeTranscriptTail(text)
        if (summary.contextTokens !== undefined) break
      }
      return {
        agent: claudeProfile,
        ...(summary.model ? { model: summary.model } : {}),
        ...(summary.contextTokens !== undefined ? { contextTokens: summary.contextTokens } : {}),
        ...(summary.lastResponseAt !== undefined ? { lastResponseAt: summary.lastResponseAt } : {}),
        ...(summary.title ? { title: summary.title } : {}),
        details: summary.permissionMode
          ? [{ id: 'permissionMode', value: summary.permissionMode }]
          : [],
      }
    },
  }
}

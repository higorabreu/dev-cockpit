import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentProfile, AgentSession, AgentSource } from '@dck/core'
import { normalizeStatusline } from './statusline.ts'
import { summarizeTranscriptTail } from './transcript.ts'

export const claudeProfile: AgentProfile = {
  id: 'claude',
  name: 'Claude',
  processes: ['claude'],
}

// Tamanhos de leitura do final do arquivo: cresce só se o trecho não tiver uma resposta com uso
const TAIL_STEPS = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024]

// O Claude Code grava as sessões em ~/.claude/projects/<diretório com tudo que não é letra
// ou número trocado por hífen>/<id>.jsonl
export function projectDirectoryName(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-')
}

async function newestTranscript(directory: string): Promise<string | undefined> {
  const names = await readdir(directory).catch(() => [] as string[])
  const files = await Promise.all(
    names
      .filter((name) => name.endsWith('.jsonl'))
      .map(async (name) => {
        const path = join(directory, name)
        const info = await stat(path).catch(() => undefined)
        return info ? { path, modified: info.mtimeMs } : undefined
      }),
  )
  const found = files.filter(
    (file): file is { path: string; modified: number } => file !== undefined,
  )
  return found.sort((a, b) => b.modified - a.modified)[0]?.path
}

async function readTail(path: string, bytes: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const length = Math.min(bytes, size)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    const text = buffer.toString('utf8')
    // Começar no meio do arquivo corta a primeira linha; ela é descartada
    return length < size ? text.slice(text.indexOf('\n') + 1) : text
  } finally {
    await handle.close()
  }
}

export interface ClaudeSourceOptions {
  readonly projectsRoot?: string
}

export function createClaudeSource(options: ClaudeSourceOptions = {}): AgentSource {
  const root = options.projectsRoot ?? join(homedir(), '.claude', 'projects')

  return {
    profile: claudeProfile,
    report: normalizeStatusline,
    async read(cwd): Promise<AgentSession | undefined> {
      const file = await newestTranscript(join(root, projectDirectoryName(cwd)))
      if (!file) return undefined
      let summary = summarizeTranscriptTail('')
      for (const bytes of TAIL_STEPS) {
        const text = await readTail(file, bytes).catch(() => undefined)
        if (text === undefined) return undefined
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

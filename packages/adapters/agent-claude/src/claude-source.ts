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

// Tamanhos de leitura do final do arquivo: cresce só se o trecho não tiver uma resposta com uso
const TAIL_STEPS = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024]

// O Claude Code grava as sessões em ~/.claude/projects/<diretório com tudo que não é letra
// ou número trocado por hífen>/<id>.jsonl
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
    // Começar no meio do arquivo corta a primeira linha; ela é descartada
    return length < size ? text.slice(text.indexOf('\n') + 1) : text
  } finally {
    await handle.close()
  }
}

export interface ClaudeSourceOptions {
  // Pasta de configuração do Claude Code, normalmente ~/.claude
  readonly claudeDir?: string
}

// O Claude Code registra cada processo vivo em ~/.claude/sessions/<pid>.json
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

// Só lê arquivos de sessão que estão dentro da pasta de projetos do Claude: o caminho vem de um
// processo externo e não pode apontar para qualquer arquivo
function insideProjects(claudeDir: string, path: string): boolean {
  const root = `${resolve(claudeDir, 'projects')}${sep}`
  const resolved = resolve(path)
  return resolved.startsWith(root) && resolved.endsWith('.jsonl')
}

// O que o próprio Claude informou (statusLine) vale mais; sem isso, o registro do processo
async function transcriptFor(
  claudeDir: string,
  context: AgentContext,
): Promise<string | undefined> {
  if (context.transcriptPath && insideProjects(claudeDir, context.transcriptPath)) {
    return resolve(context.transcriptPath)
  }
  // Sem o processo exato não há como saber qual sessão é: melhor nada que a sessão errada
  if (context.pid === undefined) return undefined
  const entry = await readRegistry(claudeDir, context.pid)
  if (!entry) return undefined
  // O início do processo tem de bater, senão o registro é de um PID que foi reaproveitado
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
        // A sessão ainda não gravou nada (antes da primeira mensagem o arquivo não existe)
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

import type { SessionSnapshot } from '@dck/core'

const REFRESH_MS = 2000
const STORAGE_KEY = 'dck-panel'

const baseName = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path
const shortPath = (path: string) => path.replace(/^\/(?:home|Users)\/[^/]+/, '~')

function row(title: string, lines: readonly string[]) {
  const section = document.createElement('section')
  const heading = document.createElement('h2')
  heading.textContent = title
  section.append(heading)
  lines.forEach((text, index) => {
    const line = document.createElement('p')
    line.textContent = text
    if (index > 0) line.className = 'sub'
    section.append(line)
  })
  return section
}

function describeActivity(snapshot: SessionSnapshot) {
  if (snapshot.activity === 'claude') return 'Claude em execução'
  if (snapshot.activity === 'idle') return 'Aguardando comando'
  return `Executando ${snapshot.process}`
}

function describeGit(snapshot: SessionSnapshot): string[] {
  const git = snapshot.git
  if (!git) return ['Fora de um repositório git']
  const changes =
    git.changed === 0
      ? 'Sem alterações'
      : `${git.changed} ${git.changed === 1 ? 'arquivo alterado' : 'arquivos alterados'}`
  const upstream = [
    git.ahead && `${git.ahead} à frente`,
    git.behind && `${git.behind} atrás`,
  ].filter(Boolean)
  return [git.branch ?? 'HEAD solta', [changes, ...upstream].join(', ')]
}

export interface PanelOptions {
  readonly element: HTMLElement
  inspect(): Promise<SessionSnapshot | undefined>
}

export function createPanel({ element, inspect }: PanelOptions) {
  let open = false
  let timer: ReturnType<typeof setInterval> | undefined
  let pending = false

  const stored = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'open'
    } catch {
      return false
    }
  }

  async function refresh() {
    if (!open || pending || document.hidden) return
    pending = true
    try {
      const snapshot = await inspect()
      if (!snapshot) {
        element.replaceChildren(row('Sessão', ['Sem informação']))
        return
      }
      const root = snapshot.git?.root ?? snapshot.cwd
      element.replaceChildren(
        row('Projeto', [baseName(root), shortPath(root)]),
        row('Branch', describeGit(snapshot)),
        row('Sessão', [describeActivity(snapshot), shortPath(snapshot.cwd)]),
      )
    } finally {
      pending = false
    }
  }

  function set(next: boolean) {
    open = next
    document.body.classList.toggle('panel-open', next)
    element.hidden = !next
    clearInterval(timer)
    if (next) {
      void refresh()
      timer = setInterval(() => void refresh(), REFRESH_MS)
    }
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'open' : 'closed')
    } catch {
      // sem armazenamento, a escolha vale só nesta execução
    }
  }

  set(stored())

  return {
    toggle: () => set(!open),
    refresh: () => void refresh(),
  }
}

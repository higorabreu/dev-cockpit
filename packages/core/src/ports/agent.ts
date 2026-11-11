// Como reconhecer um agente de código (Claude Code, Codex, Aider...) rodando num terminal
export interface AgentProfile {
  readonly id: string
  readonly name: string
  // Nomes do processo em primeiro plano que indicam esse agente
  readonly processes: readonly string[]
}

export interface AgentDetail {
  // Identificador conhecido (como `permissionMode`) que a interface sabe traduzir
  readonly id: string
  readonly value: string
}

// O que se sabe de uma sessão de agente. Tudo é opcional: cada fonte informa só o que tem,
// e a interface mostra apenas o que chegou
export interface AgentSession {
  readonly agent: AgentProfile
  readonly model?: string
  // Tokens no contexto na última chamada ao modelo
  readonly contextTokens?: number
  readonly contextWindow?: number
  readonly costUsd?: number
  // Quando verdadeiro, o custo é uma estimativa e a interface deve dizer isso
  readonly costEstimated?: boolean
  // Instante da última resposta, em milissegundos desde 1970
  readonly lastResponseAt?: number
  readonly title?: string
  readonly details: readonly AgentDetail[]
}

// Uma fonte de dados de um agente: sabe reconhecê-lo e ler a sessão dele a partir do diretório
export interface AgentSource {
  readonly profile: AgentProfile
  read(cwd: string): Promise<AgentSession | undefined>
}

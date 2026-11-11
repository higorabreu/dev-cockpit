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

// Um limite de uso da conta, como a janela de 5 horas
export interface AgentLimit {
  // Identificador conhecido (`fiveHour`, `sevenDay`) que a interface sabe traduzir
  readonly id: string
  readonly usedPercentage: number
  // Quando o limite renova, em milissegundos desde 1970
  readonly resetsAt: number
}

// O que o agente empurra durante a sessão (por exemplo pelo statusLine do Claude Code)
export interface AgentReportData {
  // Arquivo da sessão que está na tela, como o agente informa; vale mais que qualquer palpite
  readonly transcriptPath?: string
  readonly model?: string
  readonly contextTokens?: number
  readonly contextWindow?: number
  readonly costUsd?: number
  readonly costEstimated?: boolean
  readonly limits?: readonly AgentLimit[]
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
  readonly limits?: readonly AgentLimit[]
  readonly details: readonly AgentDetail[]
}

// Onde o agente roda: o diretório da aba e, quando se sabe, o processo exato em primeiro plano
export interface AgentContext {
  readonly cwd: string
  readonly pid?: number
  // Início do processo (starttime do /proc), para não confundir com um PID reaproveitado
  readonly processStart?: string
  // Arquivo da sessão informado pelo próprio agente, quando ele o empurrou
  readonly transcriptPath?: string
}

// Uma fonte de dados de um agente: sabe reconhecê-lo e ler a sessão dele a partir do diretório
export interface AgentSource {
  readonly profile: AgentProfile
  read(context: AgentContext): Promise<AgentSession | undefined>
  // Traduz o dado que o próprio agente empurra para o modelo neutro; indefinido se não reconhece
  report?(payload: unknown): AgentReportData | undefined
}

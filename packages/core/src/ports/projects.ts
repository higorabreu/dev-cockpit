export interface Project {
  readonly name: string
  readonly path: string
  // Instante da última atividade do repositório, para ordenar o que nunca foi aberto
  readonly activity?: number
}

export interface ProjectCatalog {
  // Já ordenado: os abertos recentemente primeiro, depois os mais ativos
  list(): Promise<readonly Project[]>
  touch(path: string): Promise<void>
}

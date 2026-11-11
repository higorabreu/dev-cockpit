export interface Project {
  readonly name: string
  readonly path: string
  // Instante da última atividade do repositório, para ordenar o que nunca foi aberto
  readonly activity?: number
  // Fixado pelo usuário: vai sempre para o topo da lista
  readonly favorite?: boolean
}

export interface ProjectCatalog {
  // Já ordenado: fixados, depois os abertos recentemente, depois os mais ativos
  list(): Promise<readonly Project[]>
  touch(path: string): Promise<void>
  // Fixa ou solta o projeto e devolve o novo estado
  toggleFavorite(path: string): Promise<boolean>
}

export interface Project {
  readonly name: string
  readonly path: string
}

export interface ProjectCatalog {
  list(): Promise<readonly Project[]>
}

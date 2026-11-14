export interface Project {
  readonly name: string
  readonly path: string
  // Time of the repository's last activity, to sort what was never opened
  readonly activity?: number
  // Pinned by the user: always goes to the top of the list
  readonly favorite?: boolean
}

export interface ProjectCatalog {
  // Already sorted: pinned, then recently opened, then most active
  list(): Promise<readonly Project[]>
  touch(path: string): Promise<void>
  // Pins or unpins the project and returns its new state
  toggleFavorite(path: string): Promise<boolean>
}

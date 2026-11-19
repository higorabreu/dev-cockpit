// Whether git leaves a file out (any `.gitignore`, `.git/info/exclude`, the global excludes file), as git
// itself decides; false outside a repository or when git cannot answer
export interface GitIgnoreCheck {
  isIgnored(path: string): Promise<boolean>
}

import type { StandardFile } from '../standards/resolve.ts'

// One file of a standards folder as it was read, before the core knows which extension it belongs to
export type StandardFileContent = Pick<StandardFile, 'path' | 'frontMatter' | 'body'>

export interface StandardFiles {
  // Every `*.md` directly inside the folder, sorted by name; a missing folder is an empty list.
  // A front matter that cannot be parsed is `undefined`, so the core reports the file with its path
  list(folder: string): Promise<readonly StandardFileContent[]>
  // Undefined when the file does not exist or cannot be read
  readText(path: string): Promise<string | undefined>
  // Atomic, and creates the folder when it is missing
  writeText(path: string, text: string): Promise<void>
}

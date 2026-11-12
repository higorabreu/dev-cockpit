import type { ErrorBody } from '../ipc/protocol.ts'
import type { Result } from '../result.ts'
import type { RuleFile } from '../rules/resolve.ts'

// One file of a rules folder as it was read, before the core knows which extension it belongs to
export type RuleFileContent = Pick<RuleFile, 'path' | 'frontMatter' | 'body' | 'problem'>

export interface RuleFiles {
  // The first 200 `*.md` regular files of a real folder, sorted by name; a missing folder is an empty list
  list(folder: string): Promise<readonly RuleFileContent[]>
  // Undefined when the file does not exist; a failure when it is not a regular file of at most 256 KB
  readText(path: string): Promise<Result<string | undefined, ErrorBody>>
  // Atomic and creates the folders; refused when the file or a folder between `root` and it is a link
  writeText(path: string, text: string, root: string): Promise<Result<void, ErrorBody>>
}

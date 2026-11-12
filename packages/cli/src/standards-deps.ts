import { isAbsolute, join, relative } from 'node:path'
import { createStandardFiles } from '@dck/adapter-extension-files'
import { createGitContext } from '@dck/adapter-node-git'
import { createTimedMatcher } from '@dck/adapter-node-vm'
import { createStandardsWorkspace } from '@dck/core'
import { createExtDeps, type ExtDepsOptions } from './ext-deps.ts'
import type { StandardsDeps } from './standards-commands.ts'

export interface StandardsDepsOptions extends ExtDepsOptions {
  readStdin(): Promise<string>
  // Prints the question and gives the line the user typed, empty when there is none
  ask(question: string): Promise<string>
}

const YES = /^(y|yes|s|sim)$/i

export function createStandardsDeps(options: StandardsDepsOptions): StandardsDeps {
  const { repositoryRoot } = options
  return {
    workspace: createStandardsWorkspace({
      // The same finder and disabled list as `dck ext list`, so both commands see the same sources
      ...createExtDeps(options),
      files: createStandardFiles(),
      repositoryRoot,
      globalDir: options.configDir,
      join,
    }),
    currentBranch: () => createGitContext().currentBranch(repositoryRoot),
    readInput: (file) =>
      file === undefined || file === '-' ? options.readStdin() : options.readFile(file),
    match: createTimedMatcher(),
    async confirm(question, fallback) {
      const answer = (await options.ask(question)).trim()
      return answer === '' ? fallback : YES.test(answer)
    },
    relative(path) {
      const inside = relative(repositoryRoot, path)
      return inside.startsWith('..') || isAbsolute(inside) ? path : inside
    },
  }
}

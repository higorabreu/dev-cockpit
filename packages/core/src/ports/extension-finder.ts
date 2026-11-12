import type { ExtensionCandidate } from '../extensions/load.ts'

export interface ExtensionFinder {
  // Unvalidated: a broken manifest is still a candidate, so the loader can report it with its location
  find(): Promise<readonly ExtensionCandidate[]>
}

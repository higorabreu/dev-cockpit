import { recordInteraction } from '../recency/recency.ts'

// A few files per tab to switch between quickly, the open one included; paths only, never what they hold
export const MAX_RECENT_FILES = 5

// The opened file goes first, once
export const rememberFile = (recent: readonly string[], path: string): readonly string[] =>
  recordInteraction(recent, path, MAX_RECENT_FILES)

// A file that is gone or was closed leaves the list
export const forgetFile = (recent: readonly string[], path: string): readonly string[] =>
  recent.filter((entry) => entry !== path)

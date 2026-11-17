import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  changedKeys,
  defaultSettings,
  type Logger,
  mergeSettings,
  parseSettings,
  previewValue,
  type Settings,
  type SettingsFileState,
  type SettingsIssue,
  type SettingsPatch,
  type SettingsText,
  type SettingsUpdate,
  type SettingsView,
  sameFileState,
  settingsEdits,
  settingsFileOk,
  settingsIssues,
} from '@dck/core'
import { applyEnvOverrides } from './env-overrides.ts'

export interface SettingsStoreOptions {
  readonly file: string
  readonly logger: Logger
  readonly env: Readonly<Record<string, string | undefined>>
  readonly text: SettingsText
  // Whether the projects folder exists, so a folder that does not is reported instead of saved silently
  isFolder(path: string): Promise<boolean>
  // Decides whether a change may take effect; returns the keys that must go back to the previous value
  veto?(next: Settings, changed: readonly string[]): Promise<readonly string[]> | readonly string[]
}

type Listener = (settings: Settings, changed: readonly string[]) => void
type FileListener = (file: SettingsFileState) => void

const valueAt = (source: unknown, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (value, part) =>
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)[part]
          : undefined,
      source,
    )

// Builds a nested patch with only the requested keys, taken from `source`
function pick(source: Settings, keys: readonly string[]): SettingsPatch {
  const patch: Record<string, unknown> = {}
  for (const key of keys) {
    const path = key.split('.')
    let target = patch
    for (const [index, part] of path.entries()) {
      if (index === path.length - 1) target[part] = valueAt(source, key)
      else {
        const child = (target[part] ?? {}) as Record<string, unknown>
        target[part] = child
        target = child
      }
    }
  }
  return patch as SettingsPatch
}

const pretty = (settings: Settings) => `${JSON.stringify(settings, null, 2)}\n`

export function createSettingsStore(options: SettingsStoreOptions) {
  const { file, logger, env, text } = options
  const listeners = new Set<Listener>()
  const fileListeners = new Set<FileListener>()
  // What the app uses before the environment variables; equal to the file but for refused keys
  let stored: Settings = defaultSettings
  let fresh = true
  let fileState: SettingsFileState = settingsFileOk
  // The text the settings in memory came from: a save of our own reads back the same and changes nothing
  let lastText: string | undefined
  // The values of that text as written, before the model corrects them
  let lastRaw: Readonly<Record<string, unknown>> = {}
  // Keys of the file the system refused (a taken shortcut), with the value written there
  const refused = new Map<string, unknown>()
  let view: SettingsView = { settings: defaultSettings, locked: [], fresh: true, file: fileState }
  // A reload and an update never interleave: each reads the file the other may have just written
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task)
    queue = run.catch(() => undefined)
    return run
  }

  function recompute() {
    const { settings, locked } = applyEnvOverrides(stored, env)
    view = { settings, locked, fresh, file: fileState }
  }

  function setFileState(next: SettingsFileState) {
    if (sameFileState(fileState, next)) return
    fileState = next
    recompute()
    for (const listener of fileListeners) listener(fileState)
  }

  async function issuesOf(raw: unknown, parsed: Settings): Promise<readonly SettingsIssue[]> {
    const issues = [...settingsIssues(raw, parsed)]
    for (const [key, found] of refused) {
      issues.push({
        key,
        kind: 'refused',
        found: previewValue(found),
        used: previewValue(valueAt(stored, key)),
      })
    }
    const { root } = stored.projects
    if (root !== null && !(await options.isFolder(root))) {
      issues.push({ key: 'projects.root', kind: 'missingFolder', found: previewValue(root) })
    }
    return issues
  }

  function notify(before: Settings) {
    const changed = changedKeys(before, view.settings)
    if (changed.length > 0) for (const listener of listeners) listener(view.settings, changed)
  }

  async function write(content: string): Promise<boolean> {
    try {
      await mkdir(dirname(file), { recursive: true })
      // Writes beside it and renames, so the file is never left half-written
      const temporary = `${file}.tmp`
      await writeFile(temporary, content)
      await rename(temporary, file)
      return true
    } catch (error) {
      logger.error('could not save settings', { file, error: String(error) })
      return false
    }
  }

  const readText = () =>
    readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT')
        logger.warn('settings file unreadable', { file, code: error.code })
      return undefined
    })

  // Undefined when the text is not JSON with comments: the file state then says where it broke
  function parse(content: string | undefined): Readonly<Record<string, unknown>> | undefined {
    if (content === undefined) return {}
    const read = text.read(content)
    if (read.kind === 'ok') return read.value
    logger.warn('settings file is not valid json', { file, ...read.at })
    setFileState({ kind: 'invalid', ...read.at })
    return undefined
  }

  // Takes what the file now says, as a hand edit or the CLI left it; a key the system refuses keeps its value
  async function adopt(content: string | undefined, vetoed: boolean) {
    lastText = content
    const raw = parse(content)
    if (raw === undefined) return
    const before = view.settings
    const parsed = parseSettings(raw)
    let next = parsed
    const candidate = applyEnvOverrides(next, env).settings
    const changed = changedKeys(before, candidate)
    const rejected =
      vetoed && changed.length > 0 && options.veto ? await options.veto(candidate, changed) : []
    for (const [key, found] of refused) {
      if (valueAt(parsed, key) !== found || changed.includes(key)) refused.delete(key)
    }
    for (const key of rejected) refused.set(key, valueAt(parsed, key))
    if (rejected.length > 0) next = mergeSettings(next, pick(stored, rejected))
    lastRaw = raw
    stored = next
    setFileState({ kind: 'ok', issues: await issuesOf(raw, parsed) })
    recompute()
    notify(before)
  }

  return {
    load(): Promise<SettingsView> {
      return serial(async () => {
        const content = await readText()
        fresh = content === undefined
        await adopt(content, false)
        return view
      })
    },
    get: (): SettingsView => view,
    // The file changed on disk: a hand edit, the CLI or a save of our own (which reads back the same text)
    reload(): Promise<void> {
      return serial(async () => {
        const content = await readText()
        if (content !== lastText) await adopt(content, true)
      })
    },
    update(patch: SettingsPatch): Promise<SettingsUpdate> {
      return serial(async () => {
        const content = await readText()
        // An edit the watcher has not applied yet comes first, so this write does not undo it
        if (content !== lastText) await adopt(content, true)
        const before = view.settings
        let next = mergeSettings(stored, patch)
        // Nothing is saved over a file the user left broken: the screen says where to fix it
        if (fileState.kind === 'invalid') return { ...view, rejected: changedKeys(stored, next) }
        let rejected: readonly string[] = []
        if (changedKeys(stored, next).length > 0 && options.veto) {
          const candidate = applyEnvOverrides(next, env).settings
          rejected = await options.veto(candidate, changedKeys(before, candidate))
          if (rejected.length > 0) next = mergeSettings(next, pick(stored, rejected))
        }
        const edits = settingsEdits(lastRaw, stored, next)
        // A new file is plain JSON with every value, a starting point for editing it by hand
        const output =
          edits.length === 0
            ? undefined
            : content === undefined
              ? pretty(next)
              : text.edit(content, edits)
        if (output !== undefined && (await write(output))) {
          lastText = output
          lastRaw = parse(output) ?? lastRaw
        }
        for (const key of changedKeys(stored, next)) refused.delete(key)
        stored = next
        fresh = false
        setFileState({ kind: 'ok', issues: await issuesOf(lastRaw, parseSettings(lastRaw)) })
        recompute()
        notify(before)
        return { ...view, rejected }
      })
    },
    onChange(listener: Listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    onFile(listener: FileListener) {
      fileListeners.add(listener)
      return () => void fileListeners.delete(listener)
    },
  }
}

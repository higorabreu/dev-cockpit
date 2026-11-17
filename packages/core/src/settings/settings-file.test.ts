import { describe, expect, it } from 'vitest'
import { defaultSettings, mergeSettings, parseSettings } from './settings.ts'
import { settingsEdits } from './settings-file.ts'

describe('settingsEdits', () => {
  it('should edit only the value that changed when the file has the group', () => {
    const raw = { theme: 'dark', system: { notifyAfterSeconds: 30 } }
    const before = parseSettings(raw)

    const edits = settingsEdits(
      raw,
      before,
      mergeSettings(before, { system: { notifyAfterSeconds: 60 } }),
    )

    expect(edits).toEqual([{ path: ['system', 'notifyAfterSeconds'], value: 60 }])
  })

  it('should write the whole group when the file has a plain value in its place', () => {
    const raw = { system: 5 }
    const before = parseSettings(raw)
    const after = mergeSettings(before, { system: { notifyAfterSeconds: 60 } })

    const edits = settingsEdits(raw, before, after)

    expect(edits).toEqual([{ path: ['system'], value: after.system }])
  })

  it('should keep a folder with a dot as one key when a review base is removed', () => {
    const raw = { review: { bases: { '/home/ana/acme.backend': 'origin/dev' } } }
    const before = parseSettings(raw)
    const after = { ...before, review: { ...before.review, bases: {} } }

    const edits = settingsEdits(raw, before, after)

    expect(edits).toEqual([
      { path: ['review', 'bases', '/home/ana/acme.backend'], value: undefined },
    ])
  })

  it('should edit nothing when the settings did not change', () => {
    expect(settingsEdits({}, defaultSettings, defaultSettings)).toEqual([])
  })
})

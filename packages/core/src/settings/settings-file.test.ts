import { describe, expect, it } from 'vitest'
import { defaultSettings, mergeSettings, parseSettings } from './settings.ts'
import { patchPaths, previewValue, settingsEdits, settingsIssues } from './settings-file.ts'

const issuesOf = (raw: unknown) => settingsIssues(raw, parseSettings(raw))

describe('settingsIssues', () => {
  it('should list nothing when every value is used as written', () => {
    const raw = { theme: 'light', window: { heightRatio: 0.6 }, extensions: { disabled: [] } }

    expect(issuesOf(raw)).toEqual([])
  })

  it('should report a clamped number with the value found and the one in use when it is out of range', () => {
    const issues = issuesOf({ system: { notifyAfterSeconds: 2 } })

    expect(issues).toEqual([
      { key: 'system.notifyAfterSeconds', kind: 'adjusted', found: '2', used: '5' },
    ])
  })

  it('should report a value that went back to its default when it is not one of the choices', () => {
    expect(issuesOf({ theme: 'purple' })).toEqual([
      { key: 'theme', kind: 'ignored', found: '"purple"', used: '"dark"' },
    ])
  })

  it('should report a value of the wrong type as ignored when a number was expected', () => {
    expect(issuesOf({ opacity: 'muito' })).toEqual([
      { key: 'opacity', kind: 'ignored', found: '"muito"', used: '0.92' },
    ])
  })

  it('should report a name that is no setting when the file has a typo', () => {
    expect(issuesOf({ them: 'light', window: { height: 1 } })).toEqual([
      { key: 'them', kind: 'unknown', found: '"light"' },
      { key: 'window.height', kind: 'unknown', found: '1' },
    ])
  })

  it('should report an entry left out of a map when its key is not valid', () => {
    const raw = { connections: { 'Not An Id': { url: 'https://gitlab.example.com' } } }

    expect(issuesOf(raw)).toEqual([{ key: 'connections.Not An Id', kind: 'dropped', found: '{…}' }])
  })

  it('should report a group that is not an object as ignored when the file has a plain value there', () => {
    expect(issuesOf({ system: 5 })).toEqual([
      { key: 'system', kind: 'ignored', found: '5', used: '{…}' },
    ])
  })

  it('should report the entries dropped from a list but not its order when the list had a bad id', () => {
    expect(issuesOf({ extensions: { disabled: ['dck.jira', 'dck.gitlab'] } })).toEqual([])
    expect(issuesOf({ extensions: { disabled: ['dck.gitlab', 'Bad Id!'] } })).toEqual([
      {
        key: 'extensions.disabled',
        kind: 'adjusted',
        found: '["dck.gitlab","Bad Id!"]',
        used: '["dck.gitlab"]',
      },
    ])
  })
})

describe('previewValue', () => {
  it('should cut a long text when the value would stretch the screen', () => {
    const preview = previewValue('x'.repeat(200))

    expect(preview).toHaveLength(60)
    expect(preview.endsWith('…')).toBe(true)
  })
})

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

  it('should write a set value the file holds wrongly when the value in use did not change', () => {
    // Arrange
    const raw = { theme: 'purple' }
    const before = parseSettings(raw)

    // Act
    const edits = settingsEdits(raw, before, before, [['theme'], ['fontSize']])

    // Assert
    expect(edits).toEqual([{ path: ['theme'], value: 'dark' }])
  })

  it('should edit nothing when the settings did not change', () => {
    expect(settingsEdits({}, defaultSettings, defaultSettings)).toEqual([])
  })
})

describe('patchPaths', () => {
  it('should give the path of every value a patch sets when it has groups', () => {
    expect(
      patchPaths({ theme: 'dark', terminal: { cursorStyle: 'bar', fontFamily: null } }),
    ).toEqual([['theme'], ['terminal', 'cursorStyle'], ['terminal', 'fontFamily']])
  })
})

import { describe, expect, it } from 'vitest'
import { EXTENSION_ID_MAX, parseManifest } from '../extensions/manifest.ts'
import { acceleratorFromEvent } from './accelerator.ts'
import {
  changedKeys,
  defaultSettings,
  LIMITS,
  mergeSettings,
  parseSettings,
  reviewBaseFor,
  reviewBasePatch,
  storedAccount,
} from './settings.ts'

describe('parseSettings', () => {
  it('should return the defaults when there is nothing to read', () => {
    expect(parseSettings(undefined)).toEqual(defaultSettings)
    expect(parseSettings(null)).toEqual(defaultSettings)
    expect(parseSettings('oops')).toEqual(defaultSettings)
    expect(parseSettings([])).toEqual(defaultSettings)
  })

  it('should use the documented defaults when the file is empty', () => {
    expect(defaultSettings).toEqual({
      language: 'auto',
      theme: 'dark',
      opacity: 0.92,
      fontSize: 16,
      window: { heightRatio: 0.5, panelOnFullHeight: true },
      shortcuts: { toggleWindow: 'F12', holdTrigger: 'ControlRight' },
      projects: { root: null, depth: 2 },
      connections: {},
      system: { notifyAfterSeconds: 30, agentConnectHint: true },
      review: { layout: 'auto', sideRatio: 0.5, stackedRatio: 0.5, bases: {} },
      extensions: { disabled: [] },
    })
  })

  it('should keep the valid fields and reset only the invalid one when a field has the wrong type', () => {
    const settings = parseSettings({ language: 'en', theme: 42, opacity: 'x', fontSize: 20 })

    expect(settings).toMatchObject({ language: 'en', theme: 'dark', opacity: 0.92, fontSize: 20 })
  })

  it('should cut numbers at the limits when they are out of range', () => {
    const settings = parseSettings({ opacity: 5, fontSize: 2, window: { heightRatio: -1 } })

    expect(settings.opacity).toBe(1)
    expect(settings.fontSize).toBe(10)
    expect(settings.window.heightRatio).toBe(0.3)
  })

  it('should round whole number fields when they have decimals', () => {
    expect(parseSettings({ fontSize: 15.6 }).fontSize).toBe(16)
  })

  it('should fall back to the defaults when a section is not an object', () => {
    const settings = parseSettings({ window: 'big', shortcuts: [] })

    expect(settings.window).toEqual(defaultSettings.window)
    expect(settings.shortcuts).toEqual(defaultSettings.shortcuts)
  })

  it('should keep a chosen projects root and drop an empty one when reading', () => {
    expect(parseSettings({ projects: { root: '/work' } }).projects.root).toBe('/work')
    expect(parseSettings({ projects: { root: '   ' } }).projects.root).toBeNull()
  })

  it('should keep the agent connect hint on unless it was turned off when reading', () => {
    expect(parseSettings({ system: { agentConnectHint: false } }).system.agentConnectHint).toBe(
      false,
    )
    expect(parseSettings({ system: { agentConnectHint: 'no' } }).system.agentConnectHint).toBe(true)
  })

  it('should keep a known review layout and go back to auto when it is unknown', () => {
    expect(parseSettings({ review: { layout: 'stacked' } }).review.layout).toBe('stacked')
    expect(parseSettings({ review: { layout: 'diagonal' } }).review.layout).toBe('auto')
  })

  it('should clamp the kept divider shares when they pass the limits', () => {
    const settings = parseSettings({ review: { sideRatio: 0.05, stackedRatio: 3 } })

    expect(settings.review.sideRatio).toBe(LIMITS.paneRatio.min)
    expect(settings.review.stackedRatio).toBe(LIMITS.paneRatio.max)
  })

  it('should ignore unknown fields when reading', () => {
    expect(parseSettings({ surprise: true })).toEqual(defaultSettings)
  })

  it('should accept only the known hold triggers when reading', () => {
    expect(parseSettings({ shortcuts: { holdTrigger: 'AltRight' } }).shortcuts.holdTrigger).toBe(
      'AltRight',
    )
    expect(parseSettings({ shortcuts: { holdTrigger: 'KeyQ' } }).shortcuts.holdTrigger).toBe(
      'ControlRight',
    )
  })
})

describe('parseSettings, extensions.disabled', () => {
  it('should keep the valid ids when the list is well formed', () => {
    const settings = parseSettings({ extensions: { disabled: ['acme.commits', 'acme.reviews'] } })

    expect(settings.extensions.disabled).toEqual(['acme.commits', 'acme.reviews'])
  })

  it('should fall back to the empty list when the value is not a list', () => {
    expect(parseSettings({ extensions: { disabled: 'acme.commits' } }).extensions.disabled).toEqual(
      [],
    )
    expect(parseSettings({ extensions: { disabled: { 0: 'acme.commits' } } })).toEqual(
      defaultSettings,
    )
    expect(parseSettings({ extensions: ['acme.commits'] })).toEqual(defaultSettings)
  })

  it('should drop only the bad entries when the list mixes valid and invalid ones', () => {
    const disabled = ['acme.commits', 42, null, '', 'Acme.Commits', 'no-owner', ' acme.x ', ['a.b']]

    const settings = parseSettings({ extensions: { disabled } })

    expect(settings.extensions.disabled).toEqual(['acme.commits'])
  })

  it('should accept exactly the ids a manifest may have when filtering the entries', () => {
    const manifest = (id: string) => ({
      id,
      name: 'Fixture',
      version: '1.0.0',
      apiVersion: 1,
      engines: { dck: '>=0.3.0' },
    })
    const ids = ['acme.commits', 'a1.b-2', 'acme', 'acme.commits.extra', '1acme.commits', 'a.B']

    const kept = parseSettings({ extensions: { disabled: ids } }).extensions.disabled

    expect(kept).toEqual(ids.filter((id) => parseManifest(manifest(id)).ok).sort())
  })

  it('should keep one copy in a stable order when an id is repeated', () => {
    const disabled = ['acme.reviews', 'acme.commits', 'acme.reviews']

    const settings = parseSettings({ extensions: { disabled } })

    expect(settings.extensions.disabled).toEqual(['acme.commits', 'acme.reviews'])
  })

  it('should cut the list and drop an overlong id when they pass the limits', () => {
    const many = Array.from({ length: LIMITS.disabledExtensions.max + 50 }, (_, i) => `acme.e${i}`)
    const long = `acme.${'x'.repeat(EXTENSION_ID_MAX)}`

    const settings = parseSettings({ extensions: { disabled: [long, ...many] } })

    expect(settings.extensions.disabled).toHaveLength(LIMITS.disabledExtensions.max)
    expect(settings.extensions.disabled).not.toContain(long)
  })
})

describe('review bases', () => {
  it('should keep a branch per repository folder and drop an entry that is not a branch name', () => {
    const settings = parseSettings({
      review: { bases: { '/home/ana/acme': 'develop', '/home/ana/web': '--output=x', '': 'main' } },
    })

    expect(settings.review.bases).toEqual({ '/home/ana/acme': 'develop' })
  })

  it('should find the base of the deepest repository that holds the folder', () => {
    const settings = parseSettings({
      review: { bases: { '/home/ana/acme': 'develop', '/home/ana/acme/vendor/lib': 'main' } },
    })

    expect(reviewBaseFor(settings, '/home/ana/acme/src')).toBe('develop')
    expect(reviewBaseFor(settings, '/home/ana/acme/vendor/lib/src')).toBe('main')
    expect(reviewBaseFor(settings, '/home/ana/acme-web')).toBeUndefined()
  })

  it('should add a choice and remove it when the found base is picked again', () => {
    const chosen = mergeSettings(defaultSettings, reviewBasePatch('/home/ana/acme', 'main'))
    const back = mergeSettings(chosen, reviewBasePatch('/home/ana/acme', undefined))

    expect(chosen.review.bases).toEqual({ '/home/ana/acme': 'main' })
    expect(back.review.bases).toEqual({})
  })
})

describe('mergeSettings', () => {
  it('should change only the given field and keep the rest when merging a patch', () => {
    const merged = mergeSettings(defaultSettings, { window: { heightRatio: 0.7 } })

    expect(merged.window).toEqual({ heightRatio: 0.7, panelOnFullHeight: true })
    expect(merged.theme).toBe('dark')
  })

  it('should clamp a patched value when it is out of range', () => {
    expect(mergeSettings(defaultSettings, { opacity: 0.1 }).opacity).toBe(0.3)
  })

  it('should allow clearing the projects root when merging null', () => {
    const withRoot = mergeSettings(defaultSettings, { projects: { root: '/work' } })

    expect(mergeSettings(withRoot, { projects: { root: null } }).projects.root).toBeNull()
  })

  it('should replace the whole list when a patch brings disabled extensions', () => {
    const current = mergeSettings(defaultSettings, {
      extensions: { disabled: ['acme.commits', 'acme.reviews', 'acme.themes'] },
    })

    const shorter = mergeSettings(current, { extensions: { disabled: ['acme.themes'] } })
    const empty = mergeSettings(current, { extensions: { disabled: [] } })

    expect(shorter.extensions.disabled).toEqual(['acme.themes'])
    expect(empty.extensions.disabled).toEqual([])
  })

  it('should keep the disabled extensions when a patch touches another field', () => {
    const current = mergeSettings(defaultSettings, { extensions: { disabled: ['acme.commits'] } })

    const merged = mergeSettings(current, { theme: 'light', extensions: {} })

    expect(merged.extensions.disabled).toEqual(['acme.commits'])
  })

  it('should not change the current settings object when merging', () => {
    const before = structuredClone(defaultSettings)

    mergeSettings(defaultSettings, { theme: 'light' })

    expect(defaultSettings).toEqual(before)
  })
})

describe('changedKeys', () => {
  it('should list the dotted keys that differ between two settings', () => {
    const after = mergeSettings(defaultSettings, { theme: 'light', window: { heightRatio: 0.8 } })

    expect([...changedKeys(defaultSettings, after)].sort()).toEqual(['theme', 'window.heightRatio'])
  })

  it('should list the disabled extensions once when the list changes', () => {
    const after = mergeSettings(defaultSettings, { extensions: { disabled: ['acme.commits'] } })

    expect(changedKeys(defaultSettings, after)).toEqual(['extensions.disabled'])
  })

  it('should list nothing when the disabled extensions are the same in another order', () => {
    const before = parseSettings({ extensions: { disabled: ['acme.commits', 'acme.reviews'] } })
    const after = parseSettings({ extensions: { disabled: ['acme.reviews', 'acme.commits'] } })

    expect(changedKeys(before, after)).toEqual([])
  })

  it('should list nothing when the settings are the same', () => {
    expect(changedKeys(defaultSettings, parseSettings({}))).toEqual([])
  })
})

const press = (
  key: string,
  modifiers: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {},
) =>
  acceleratorFromEvent({
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...modifiers,
  })

describe('acceleratorFromEvent', () => {
  it('should accept a function key alone when it is pressed', () => {
    expect(press('F12')).toEqual({ type: 'accelerator', value: 'F12' })
  })

  it('should join the modifiers in a fixed order when several are held', () => {
    expect(press(' ', { shiftKey: true, ctrlKey: true, altKey: true })).toEqual({
      type: 'accelerator',
      value: 'Ctrl+Alt+Shift+Space',
    })
  })

  it('should uppercase letters and require a modifier when a letter is pressed', () => {
    expect(press('k', { ctrlKey: true })).toEqual({ type: 'accelerator', value: 'Ctrl+K' })
    expect(press('k')).toEqual({ type: 'invalid', reason: 'needsModifier' })
  })

  it('should wait when only modifiers are held', () => {
    expect(press('Control', { ctrlKey: true })).toEqual({ type: 'pending' })
    expect(press('Shift', { shiftKey: true })).toEqual({ type: 'pending' })
  })

  it('should cancel when escape is pressed', () => {
    expect(press('Escape')).toEqual({ type: 'cancel' })
  })

  it('should name the arrow keys the way the system expects', () => {
    expect(press('ArrowUp', { altKey: true })).toEqual({ type: 'accelerator', value: 'Alt+Up' })
  })

  it('should refuse keys that cannot be a global shortcut', () => {
    expect(press('Dead', { ctrlKey: true })).toEqual({ type: 'invalid', reason: 'unsupported' })
  })

  it('should call the windows key Super when it is held', () => {
    expect(press('d', { metaKey: true })).toEqual({ type: 'accelerator', value: 'Super+D' })
  })
})

describe('connections.gitlab.url', () => {
  it('should default to no address when the settings are empty', () => {
    expect(parseSettings({}).connections.gitlab?.url ?? null).toBeNull()
  })

  it('should keep the normalized address when it is https', () => {
    const settings = parseSettings({ connections: { gitlab: { url: 'https://gl.test/' } } })

    expect(settings.connections.gitlab?.url).toBe('https://gl.test')
  })

  it.each(['http://gl.test', 'gitlab', 42, 'https://u:p@gl.test'])(
    'should fall back to no address when the value is %s',
    (value) => {
      const settings = parseSettings({ connections: { gitlab: { url: value } } })

      expect(settings.connections.gitlab?.url).toBeNull()
    },
  )
})

describe('connections, per connector', () => {
  it('should read back an existing file entry exactly when it only has the address', () => {
    const file = { connections: { gitlab: { url: 'https://gitlab.example.com' } } }

    const settings = parseSettings(file)

    expect(settings.connections).toEqual(file.connections)
    expect(JSON.stringify(settings.connections)).toBe(JSON.stringify(file.connections))
  })

  it('should keep the e-mail when the connector asks for one', () => {
    const settings = parseSettings({
      connections: { jira: { url: 'https://acme.example.com', email: ' ana@example.com ' } },
    })

    expect(settings.connections.jira).toEqual({
      url: 'https://acme.example.com',
      email: 'ana@example.com',
    })
  })

  it('should drop only the e-mail when it is not an address', () => {
    const settings = parseSettings({
      connections: { jira: { url: 'https://acme.example.com', email: 'ana' } },
    })

    expect(settings.connections.jira).toEqual({ url: 'https://acme.example.com' })
  })

  it.each([
    ['an id with capitals', 'GitLab'],
    ['an id with a dot', 'acme.tracker'],
    ['an empty id', ''],
  ])('should drop the entry and keep the others when it has %s', (_label, id) => {
    const settings = parseSettings({
      connections: { [id]: { url: 'https://a.example.com' }, gitlab: { url: 'https://gl.test' } },
    })

    expect(settings.connections).toEqual({ gitlab: { url: 'https://gl.test' } })
  })

  it('should go back to no connections when the value is not an object', () => {
    expect(parseSettings({ connections: ['gitlab'] }).connections).toEqual({})
  })

  it('should leave no e-mail behind when a patch erases the account with an empty one', () => {
    const before = parseSettings({
      connections: { jira: { url: 'https://acme.example.com', email: 'ana@example.com' } },
    })

    const after = mergeSettings(before, { connections: { jira: { url: null, email: '' } } })

    expect(after.connections.jira).toEqual({ url: null })
    expect(JSON.stringify(after.connections)).not.toContain('ana@example.com')
  })

  it('should read the stored account with its e-mail only when it has an address', () => {
    const settings = parseSettings({
      connections: {
        jira: { url: 'https://acme.example.com', email: 'ana@example.com' },
        gitlab: { url: 'https://gl.test' },
        other: { url: null },
      },
    })

    expect(storedAccount(settings, 'jira')).toEqual({
      url: 'https://acme.example.com',
      email: 'ana@example.com',
    })
    expect(storedAccount(settings, 'gitlab')).toEqual({ url: 'https://gl.test' })
    expect(storedAccount(settings, 'other')).toBeNull()
    expect(storedAccount(settings, 'missing')).toBeNull()
  })

  it('should name the address of one connector when only it changed', () => {
    const before = parseSettings({ connections: { gitlab: { url: 'https://a.example.com' } } })
    const after = mergeSettings(before, { connections: { gitlab: { url: null } } })

    expect(changedKeys(before, after)).toEqual(['connections.gitlab.url'])
  })
})

// @vitest-environment happy-dom
import { createTranslator, type HostApi, type UpdateNotice } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotice } from '../tabs/notice.ts'
import type { MenuAction } from '../tabs/tab-menu.ts'
import { createUpdateNotice } from './update-notice.ts'

// The open files are settled before a restart, which then goes on after a turn of the event loop
const settleFiles = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(
  options: { agents?: number; canInstall?: boolean; narrow?: boolean; files?: boolean } = {},
) {
  document.body.replaceChildren()
  const element = document.createElement('div')
  document.body.append(element)
  const i18n = createTranslator('en')
  // Every width reads 0 here: given a strip, the tabs never keep their room and the notice is compact
  const notice = createNotice(
    element,
    i18n,
    options.narrow ? document.createElement('div') : undefined,
  )
  const calls: string[] = []
  const menus: {
    labels: string[]
    actions: readonly MenuAction[]
    anchor: HTMLElement
    caption: string | undefined
    closed: boolean
  }[] = []
  const updates = {
    install: () => void calls.push('install'),
    openRelease: () => void calls.push('openRelease'),
    dismiss: () => void calls.push('dismiss'),
    restart: () => void calls.push('restart'),
  } as unknown as HostApi['updates']
  const update = createUpdateNotice({
    notice,
    i18n,
    updates,
    agentTabs: () => options.agents ?? 0,
    saveTabs: () => void calls.push('saveTabs'),
    beforeRestart: async () => options.files ?? true,
    done: () => void calls.push('done'),
    openMenu(actions, anchor, caption) {
      const labels = actions.map((action) => action.label)
      const entry = { labels, actions, anchor, caption, closed: false }
      menus.push(entry)
      return {
        close: () => {
          entry.closed = true
        },
      }
    },
  })
  const show = (next: UpdateNotice) =>
    update.show({ canInstall: options.canInstall ?? true, check: { kind: 'never' }, notice: next })
  const button = (label: string) => {
    const found = [...element.querySelectorAll('button')].find(
      (candidate) =>
        candidate.textContent === label || candidate.getAttribute('aria-label') === label,
    )
    if (!found) throw new Error(`invariant: the notice has ${label}`)
    return found
  }
  return { element, notice, show, calls, button, menus }
}

const labels = (element: HTMLElement) =>
  [...element.children].map((child) => child.textContent || child.getAttribute('aria-label'))

describe('createUpdateNotice', () => {
  it('should offer Update, What is new and Dismiss when a newer version is available', () => {
    const { element, show } = setup()

    show({ kind: 'available', version: '0.10.0' })

    expect(labels(element)).toEqual(['Version 0.10.0 available', 'Update', "What's new", 'Dismiss'])
  })

  it('should leave Update out when the system cannot install', () => {
    const { element, show } = setup({ canInstall: false })

    show({ kind: 'available', version: '0.10.0' })

    expect(labels(element)).toEqual(['Version 0.10.0 available', "What's new", 'Dismiss'])
  })

  it('should ask the host and give the keys back when an action is pressed', () => {
    const { show, button, calls } = setup()
    show({ kind: 'available', version: '0.10.0' })

    button('Update').click()
    button("What's new").click()
    button('Dismiss').click()

    expect(calls).toEqual(['install', 'done', 'openRelease', 'done', 'dismiss', 'done'])
  })

  it('should show the percent while downloading when the size is known', () => {
    const { element, show } = setup()

    show({ kind: 'downloading', version: '0.10.0', percent: 42 })

    expect(labels(element)).toEqual(['Downloading 0.10.0', '42%'])
  })

  it('should save the tabs and restart when no agent is running', async () => {
    const { show, button, calls } = setup()
    show({ kind: 'installed', version: '0.10.0' })

    button('Restart').click()
    await settleFiles()

    expect(calls).toEqual(['done', 'saveTabs', 'restart'])
  })

  it('should keep the update ready and restart nothing when a file needs the user first', async () => {
    // Arrange
    const { element, show, button, calls } = setup({ files: false })
    show({ kind: 'installed', version: '0.10.0' })

    // Act
    button('Restart').click()
    await settleFiles()

    // Assert
    expect(calls).toEqual(['done'])
    expect(labels(element)).toContain('Restart')
  })

  it('should ask inline first when a tab has an agent running', async () => {
    const { element, show, button, calls } = setup({ agents: 1 })
    show({ kind: 'installed', version: '0.10.0' })

    button('Restart').click()

    expect(labels(element)).toEqual(['1 tab has an agent running', 'Cancel', 'Restart anyway'])
    expect(calls).toEqual(['done'])
    button('Restart anyway').click()
    await settleFiles()
    expect(calls).toEqual(['done', 'done', 'saveTabs', 'restart'])
  })

  it('should go back to the installed notice when the warning is cancelled', () => {
    const { element, show, button } = setup({ agents: 2 })
    show({ kind: 'installed', version: '0.10.0' })
    button('Restart').click()

    button('Cancel').click()

    expect(labels(element)).toEqual(['Updated to 0.10.0', 'Restart', 'Dismiss'])
  })

  it('should say what failed from the error catalog when the install fails', () => {
    const { element, show } = setup()

    show({ kind: 'failed', version: '0.10.0', code: 'DCK-UPD-005' })

    expect(labels(element)).toEqual(['Corrupted download; update canceled', 'Dismiss'])
  })

  it('should empty the notice when there is nothing to show', () => {
    const { element, show } = setup()
    show({ kind: 'available', version: '0.10.0' })

    show({ kind: 'none' })

    expect(element.children).toHaveLength(0)
  })
})

describe('createUpdateNotice compact', () => {
  const icon = (element: HTMLElement) => element.querySelector<HTMLElement>('.notice-icon')
  const choose = (actions: readonly MenuAction[], label: string) =>
    actions.find((action) => action.label === label)?.run()

  it('should show one named icon with the whole text as its tooltip when the bar is narrow', () => {
    // Arrange
    const { element, show } = setup({ narrow: true })

    // Act
    show({ kind: 'available', version: '0.10.0' })

    // Assert
    const shown = icon(element)
    expect(element.children).toHaveLength(1)
    expect(shown?.tagName).toBe('BUTTON')
    expect(shown?.getAttribute('data-tip')).toBe('Version 0.10.0 available')
    expect(shown?.getAttribute('aria-label')).toBe('Version 0.10.0 available')
    expect(shown?.getAttribute('aria-haspopup')).toBe('menu')
    expect(shown?.dataset.tone).toBe('news')
    expect(shown?.querySelector('svg')?.getAttribute('width')).toBe('17')
  })

  it('should open a menu with the same actions as the full notice when the icon is pressed', () => {
    // Arrange
    const { element, show, menus, calls } = setup({ narrow: true })
    show({ kind: 'available', version: '0.10.0' })
    const shown = icon(element)

    // Act
    shown?.click()
    choose(menus[0]?.actions ?? [], 'Update')

    // Assert
    expect(menus.map((menu) => menu.labels)).toEqual([['Update', "What's new", 'Dismiss']])
    expect(menus[0]?.anchor).toBe(shown)
    expect(calls).toEqual(['install', 'done'])
  })

  it('should offer only Dismiss in the menu when the install failed', () => {
    const { element, show, menus } = setup({ narrow: true })
    show({ kind: 'failed', version: '0.10.0', code: 'DCK-UPD-005' })

    icon(element)?.click()

    expect(icon(element)?.dataset.tone).toBe('critical')
    expect(menus.map((menu) => menu.labels)).toEqual([['Dismiss']])
  })

  it('should show a plain image with the percent in its tooltip while downloading', () => {
    const { element, show } = setup({ narrow: true })

    show({ kind: 'downloading', version: '0.10.0', percent: 42 })

    const shown = icon(element)
    expect(shown?.tagName).toBe('SPAN')
    expect(shown?.getAttribute('role')).toBe('img')
    expect(shown?.getAttribute('data-tip')).toBe('Downloading 0.10.0, 42%')
  })

  it('should bring the menu back with the question when Restart is chosen with an agent running', async () => {
    // Arrange
    const { element, show, menus, calls } = setup({ narrow: true, agents: 1 })
    show({ kind: 'installed', version: '0.10.0' })
    icon(element)?.click()

    // Act
    choose(menus[0]?.actions ?? [], 'Restart')
    const asked = icon(element)
    choose(menus[1]?.actions ?? [], 'Restart anyway')
    await settleFiles()

    // Assert
    expect(menus.map((menu) => menu.labels)).toEqual([
      ['Restart', 'Dismiss'],
      ['Cancel', 'Restart anyway'],
    ])
    expect(menus[1]?.anchor).toBe(asked)
    expect(menus.map((menu) => menu.caption)).toEqual([undefined, '1 tab has an agent running'])
    expect(asked?.getAttribute('data-tip')).toBe('1 tab has an agent running')
    expect(asked?.dataset.tone).toBe('warning')
    expect(calls).toEqual(['done', 'saveTabs', 'restart'])
  })

  it('should close its menu when the update state changes while it is open', () => {
    // Arrange
    const { element, show, menus } = setup({ narrow: true })
    show({ kind: 'available', version: '0.10.0' })
    icon(element)?.click()

    // Act
    show({ kind: 'downloading', version: '0.10.0', percent: 3 })

    // Assert
    expect(menus.map((menu) => menu.closed)).toEqual([true])
  })

  it('should keep its menu open when the same state comes again', () => {
    // Arrange
    const { element, show, menus } = setup({ narrow: true })
    show({ kind: 'available', version: '0.10.0' })
    icon(element)?.click()

    // Act
    show({ kind: 'available', version: '0.10.0' })

    // Assert
    expect(menus.map((menu) => menu.closed)).toEqual([false])
  })

  it('should name the icon in portuguese when the interface is in portuguese', () => {
    // Arrange
    document.body.replaceChildren()
    const element = document.createElement('div')
    document.body.append(element)
    const i18n = createTranslator('pt-BR')
    const update = createUpdateNotice({
      notice: createNotice(element, i18n, document.createElement('div')),
      i18n,
      updates: {} as HostApi['updates'],
      agentTabs: () => 0,
      saveTabs: () => undefined,
      beforeRestart: async () => true,
      done: () => undefined,
      openMenu: () => ({ close: () => undefined }),
    })

    // Act
    update.show({
      canInstall: true,
      check: { kind: 'never' },
      notice: { kind: 'downloading', version: '0.10.0', percent: 7 },
    })

    // Assert
    expect(icon(element)?.getAttribute('aria-label')).toBe('Baixando 0.10.0, 7%')
  })
})

describe('createNotice with a lasting notice', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('should show a copy over the update and give the update back when the copy goes', () => {
    const { element, notice, show } = setup()
    show({ kind: 'available', version: '0.10.0' })

    notice.copied('abc')
    const during = labels(element)
    vi.advanceTimersByTime(2000)

    expect(during).toEqual(['Copied', '3 characters'])
    expect(labels(element)[0]).toBe('Version 0.10.0 available')
  })
})

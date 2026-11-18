// @vitest-environment happy-dom
import { createTranslator, type HostApi, type UpdateNotice } from '@dck/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotice } from '../tabs/notice.ts'
import { createUpdateNotice } from './update-notice.ts'

function setup(options: { agents?: number; canInstall?: boolean } = {}) {
  document.body.replaceChildren()
  const element = document.createElement('div')
  document.body.append(element)
  const i18n = createTranslator('en')
  const notice = createNotice(element, i18n)
  const calls: string[] = []
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
    done: () => void calls.push('done'),
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
  return { element, notice, show, calls, button }
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

  it('should save the tabs and restart when no agent is running', () => {
    const { show, button, calls } = setup()
    show({ kind: 'installed', version: '0.10.0' })

    button('Restart').click()

    expect(calls).toEqual(['saveTabs', 'restart', 'done'])
  })

  it('should ask inline first when a tab has an agent running', () => {
    const { element, show, button, calls } = setup({ agents: 1 })
    show({ kind: 'installed', version: '0.10.0' })

    button('Restart').click()

    expect(labels(element)).toEqual(['1 tab has an agent running', 'Restart anyway', 'Cancel'])
    expect(calls).toEqual(['done'])
    button('Restart anyway').click()
    expect(calls).toEqual(['done', 'saveTabs', 'restart', 'done'])
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

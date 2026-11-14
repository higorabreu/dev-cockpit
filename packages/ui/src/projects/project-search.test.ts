// @vitest-environment happy-dom
import { createTranslator } from '@dck/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectSearch, type SearchEntry } from './project-search.ts'

const entry = (name: string): SearchEntry => ({
  path: `/home/ana/work/${name}`,
  label: name,
  location: `~/work/${name}`,
})

function setup(language: 'en' | 'pt-BR' = 'en') {
  const overlay = document.createElement('div')
  const box = document.createElement('div')
  const input = document.createElement('input')
  const results = document.createElement('div')
  const hint = document.createElement('div')
  box.append(input, results, hint)
  overlay.append(box)
  document.body.append(overlay)
  const picked: string[] = []
  let chooseRequests = 0
  let closes = 0
  const search = createProjectSearch(
    { overlay, input, results, hint },
    {
      onPick: (path) => void picked.push(path),
      onClose: () => {
        closes += 1
      },
      onToggleFavorite: () => undefined,
      onChooseRoot: () => {
        chooseRequests += 1
      },
      t: createTranslator(language).t,
    },
  )
  return {
    search,
    overlay,
    input,
    results,
    hint,
    picked,
    chooseRequests: () => chooseRequests,
    closes: () => closes,
  }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('createProjectSearch', () => {
  it('should show one action to choose the projects folder when no folder was chosen', () => {
    const { search, overlay, results, input, hint } = setup()

    search.askForRoot()

    expect(overlay.classList.contains('open')).toBe(true)
    expect(results.querySelector('.psetup strong')?.textContent).toBe('No projects folder yet')
    const buttons = results.querySelectorAll('button')
    expect([...buttons].map((button) => button.textContent)).toEqual(['Choose the projects folder'])
    expect(document.activeElement).toBe(buttons[0])
    expect(input.disabled).toBe(true)
    expect(results.getAttribute('role')).toBeNull()
    expect(hint.hidden).toBe(true)
  })

  it('should show the action in Portuguese when the interface is in Portuguese', () => {
    const { search, results } = setup('pt-BR')

    search.askForRoot()

    expect(results.querySelector('button')?.textContent).toBe('Escolher a pasta de projetos')
  })

  it('should ask the host for a folder when the user activates the action', () => {
    const { search, results, chooseRequests } = setup()
    search.askForRoot()

    results.querySelector('button')?.click()

    expect(chooseRequests()).toBe(1)
  })

  it('should close from the action when the user presses Escape', () => {
    const { search, results, overlay, closes } = setup()
    search.askForRoot()

    results
      .querySelector('button')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(overlay.classList.contains('open')).toBe(false)
    expect(closes()).toBe(1)
  })

  it('should list the projects and focus the field when it opens after the folder is chosen', () => {
    const { search, results, input, hint, picked } = setup()
    search.askForRoot()

    search.open([entry('alpha'), entry('beta')])
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(results.querySelector('.psetup')).toBeNull()
    expect(input.disabled).toBe(false)
    expect(results.getAttribute('role')).toBe('listbox')
    expect(hint.hidden).toBe(false)
    expect(hint.textContent).toContain('Ctrl+D')
    expect(picked).toEqual(['/home/ana/work/alpha'])
  })
})

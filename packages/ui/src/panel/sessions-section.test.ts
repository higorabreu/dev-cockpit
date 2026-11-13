// @vitest-environment happy-dom
import { type AgentProfile, createTranslator, type SessionActivityInfo } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { createSessionsSection, type SessionsSource } from './sessions-section.ts'

const acme: AgentProfile = {
  id: 'acme',
  name: 'Acme Agent',
  processes: ['acme'],
  connect: { shell: 'acme plugin add dck', inAgent: '!acme plugin add dck' },
}
const running: SessionActivityInfo = {
  cwd: '/home/ana/acme',
  process: 'acme',
  activity: 'agent',
  agent: acme,
}

function draw(hinted: string | readonly string[] | undefined, locale: 'en' | 'pt-BR' = 'en') {
  const asking = new Set(typeof hinted === 'string' ? [hinted] : (hinted ?? []))
  const calls: string[] = []
  const source: SessionsSource = {
    tabs: () => [
      { id: 'tab-1', label: 'backend' },
      { id: 'tab-2', label: 'frontend' },
    ],
    activeId: () => 'tab-1',
    info: (id) => (id === 'tab-1' ? running : undefined),
    finished: () => undefined,
    needsYou: () => false,
    finishedCount: () => 0,
    select: (id) => void calls.push(`select ${id}`),
    connectHint: (id) => (asking.has(id) ? acme : undefined),
    connect: (id) => void calls.push(`connect ${id}`),
    dismissConnect: () => void calls.push('dismiss'),
  }
  const body = createSessionsSection(source, createTranslator(locale)).body()
  document.body.replaceChildren(body)
  const button = (name: string) =>
    [...body.querySelectorAll<HTMLButtonElement>('.sconnect button')].find(
      (candidate) => candidate.textContent === name,
    )
  return { body, calls, button }
}

describe('sessions section, connect hint', () => {
  it('should show the hint under the agent row when the agent can be connected', () => {
    const { body } = draw('tab-1')

    const hint = body.querySelector('.sconnect')

    expect(hint?.previousElementSibling?.textContent).toContain('backend')
    expect(hint?.textContent).toContain('Connect it to see when it needs you')
    expect(body.querySelectorAll('.sconnect')).toHaveLength(1)
  })

  it('should show the hint once under the first agent when several agents can be connected', () => {
    const { body } = draw(['tab-1', 'tab-2'])

    const hints = body.querySelectorAll('.sconnect')

    expect(hints).toHaveLength(1)
    expect(hints[0]?.previousElementSibling?.textContent).toContain('backend')
  })

  it('should show no hint when no tab asks for it', () => {
    const { body } = draw(undefined)

    expect(body.querySelector('.sconnect')).toBeNull()
  })

  it('should connect that tab when Connect is clicked', () => {
    const { button, calls } = draw('tab-1')

    button('Connect')?.click()

    expect(calls).toEqual(['connect tab-1'])
  })

  it('should dismiss the hint when Not now is clicked', () => {
    const { button, calls } = draw('tab-1')

    button('Not now')?.click()

    expect(calls).toEqual(['dismiss'])
  })

  it('should give the hint buttons a stable focus key and describe Connect when drawn', () => {
    const { button, body } = draw('tab-1')

    const connect = button('Connect')
    const described = body.querySelector(`#${connect?.getAttribute('aria-describedby')}`)

    expect(connect?.dataset.focus).toBe('connect-tab-1')
    expect(button('Not now')?.dataset.focus).toBe('connect-later-tab-1')
    expect(described?.textContent).toBe('Connect it to see when it needs you')
  })

  it('should show the hint in Portuguese when the interface is in Portuguese', () => {
    const { body, button } = draw('tab-1', 'pt-BR')

    expect(body.querySelector('.sconnect')?.textContent).toContain(
      'Conecte e veja quando ele precisa de você',
    )
    expect(button('Conectar')).toBeDefined()
    expect(button('Agora não')).toBeDefined()
  })
})

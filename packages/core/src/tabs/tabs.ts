import { recordInteraction } from '../recency/recency.ts'

export interface TabInfo {
  readonly id: string
  readonly label: string
}

export interface TabsState {
  readonly tabs: readonly TabInfo[]
  readonly activeId: string | undefined
  readonly recent: readonly string[]
}

export const emptyTabs: TabsState = { tabs: [], activeId: undefined, recent: [] }

const has = (state: TabsState, id: string) => state.tabs.some((tab) => tab.id === id)

function activate(state: TabsState, id: string): TabsState {
  return { ...state, activeId: id, recent: recordInteraction(state.recent, id) }
}

export function openTab(state: TabsState, tab: TabInfo): TabsState {
  if (has(state, tab.id)) return state
  return activate({ ...state, tabs: [...state.tabs, tab] }, tab.id)
}

export function activateTab(state: TabsState, id: string): TabsState {
  return has(state, id) ? activate(state, id) : state
}

// A última aba nunca fecha: a janela sempre tem um terminal
export function closeTab(state: TabsState, id: string): TabsState {
  if (!has(state, id) || state.tabs.length <= 1) return state
  const tabs = state.tabs.filter((tab) => tab.id !== id)
  const recent = state.recent.filter((entry) => entry !== id)
  if (state.activeId !== id) return { ...state, tabs, recent }
  const next = recent.find((entry) => tabs.some((tab) => tab.id === entry)) ?? tabs[0]?.id
  return { tabs, recent, activeId: next }
}

export function closeOtherTabs(state: TabsState, id: string): TabsState {
  if (!has(state, id)) return state
  const tabs = state.tabs.filter((tab) => tab.id === id)
  return activate({ ...state, tabs, recent: [] }, id)
}

export function stepTab(state: TabsState, direction: 1 | -1): TabsState {
  const current = state.tabs.findIndex((tab) => tab.id === state.activeId)
  const size = state.tabs.length
  if (current === -1 || size === 0) return state
  const next = state.tabs[(current + direction + size) % size]
  return next ? activate(state, next.id) : state
}

export function activateTabAt(state: TabsState, index: number): TabsState {
  const tab = state.tabs[index]
  return tab ? activate(state, tab.id) : state
}

// Aceita só uma permutação das abas atuais, para o arrastar da barra não perder nem inventar abas
export function reorderTabs(state: TabsState, ids: readonly string[]): TabsState {
  const sameSet =
    ids.length === state.tabs.length && state.tabs.every((tab) => ids.includes(tab.id))
  if (!sameSet) return state
  const byId = new Map(state.tabs.map((tab) => [tab.id, tab]))
  const tabs = ids.flatMap((id) => byId.get(id) ?? [])
  return { ...state, tabs }
}

// Da mais recente para a mais antiga, com as abas nunca usadas no fim
export function recentTabs(state: TabsState): readonly TabInfo[] {
  const byId = new Map(state.tabs.map((tab) => [tab.id, tab]))
  const used = state.recent.flatMap((id) => byId.get(id) ?? [])
  return [...used, ...state.tabs.filter((tab) => !state.recent.includes(tab.id))]
}

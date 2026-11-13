import type { AgentProfile, MenuItem, SessionActivityInfo, Translate } from '@dck/core'

export interface AgentConnectDeps {
  profiles(): readonly AgentProfile[]
  info(tabId: string): SessionActivityInfo | undefined
  write(tabId: string, text: string): void
}

export const CONNECT_ITEM = 'agent:connect'

// Types an agent's connect command into a tab without Enter, so the user reads what will run and confirms
export function createAgentConnect(deps: AgentConnectDeps) {
  const connectable = () => deps.profiles().find((profile) => profile.connect)

  // Inside a running agent the shell form would be sent as a message, so the agent's own form goes there
  function inputFor(tabId: string): string | undefined {
    const info = deps.info(tabId)
    if (info?.activity === 'agent') return info.agent?.connect?.inAgent
    return connectable()?.connect?.shell
  }

  return {
    // False when there is nothing to type: an agent without a way to connect is in the foreground
    connect(tabId: string): boolean {
      const text = inputFor(tabId)
      if (!text) return false
      deps.write(tabId, text)
      return true
    },
    menuItems: (t: Translate): readonly MenuItem[] =>
      connectable() ? [{ id: CONNECT_ITEM, label: t('menu.agent.connect') }] : [],
  }
}

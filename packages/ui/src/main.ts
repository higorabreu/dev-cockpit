import '@xterm/xterm/css/xterm.css'
import 'virtual:dck-tokens.css'
import './styles.css'
import { startApp } from './app.ts'
import { createSettingsClient } from './settings-client.ts'
import { installTooltips } from './tooltip.ts'

const element = (id: string) => {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id} element`)
  return found
}

installTooltips()
const settings = await createSettingsClient(window.dck)

await startApp(
  {
    bar: element('bar'),
    host: element('host'),
    main: element('main'),
    dock: element('dock'),
    panel: element('panel'),
    rail: element('rail-sections'),
    settingsButton: element('rail-settings'),
    viewsButton: element('rail-views'),
    viewsBadge: element('rail-views-badge'),
    split: element('split'),
    notice: element('notice'),
    menu: element('tab-menu'),
    search: element('search'),
    searchInput: element('search-input') as HTMLInputElement,
    searchResults: element('search-results'),
    searchHint: element('search-hint'),
    views: element('views'),
    settings: element('settings'),
    settingsBody: element('settings-body'),
    scrim: element('menu'),
    card: element('menu-card'),
    hint: element('menu-hint'),
  },
  window.dck,
  settings,
)

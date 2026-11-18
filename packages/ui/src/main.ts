// The cockpit's own fonts ship with it (OFL), so it looks the same on every machine
import '@fontsource-variable/inter/index.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import '@xterm/xterm/css/xterm.css'
import 'virtual:dck-tokens.css'
import './styles/index.css'
import { isShortcutId } from '@dck/core'
import { startApp } from './app.ts'
import { installScrollbars } from './kit/scrollbar.ts'
import { installTooltips } from './kit/tooltip.ts'
import { createKeymap, keyboardFor } from './platform/keymap.ts'
import { createSettingsClient } from './settings/settings-client.ts'

const element = (id: string) => {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id} element`)
  return found
}

installScrollbars()
const settings = await createSettingsClient(window.dck)
// One keymap for the whole window; it reads the custom keys from the settings at each key
const keymap = createKeymap(
  keyboardFor(navigator.platform),
  () => settings.current().shortcuts.keys,
)
installTooltips({ shortcutLabel: (id) => (isShortcutId(id) ? keymap.label(id) : undefined) })

await startApp(
  {
    bar: element('bar'),
    tabs: element('tabs'),
    tabsNew: element('tabs-new'),
    tabsAll: element('tabs-all'),
    tabList: element('tab-list'),
    host: element('host'),
    main: element('main'),
    dock: element('dock'),
    panel: element('panel'),
    rail: element('rail-sections'),
    panelToggle: element('rail-panel'),
    settingsButton: element('rail-settings'),
    viewsButton: element('rail-views'),
    split: element('split'),
    edge: element('edge'),
    edgeSize: element('edge-size'),
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
  keymap,
)

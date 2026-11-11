import '@xterm/xterm/css/xterm.css'
import 'virtual:dck-tokens.css'
import './styles.css'
import { startApp } from './app.ts'
import { applyTheme, currentTheme } from './theme.ts'

const element = (id: string) => {
  const found = document.getElementById(id)
  if (!found) throw new Error(`missing #${id} element`)
  return found
}

const theme = currentTheme()
applyTheme(theme)

await startApp(
  {
    bar: element('bar'),
    host: element('host'),
    main: element('main'),
    dock: element('dock'),
    panel: element('panel'),
    rail: element('rail'),
    split: element('split'),
    notice: element('notice'),
    menu: element('tab-menu'),
    search: element('search'),
    searchInput: element('search-input') as HTMLInputElement,
    searchResults: element('search-results'),
    scrim: element('menu'),
    card: element('menu-card'),
    hint: element('menu-hint'),
  },
  window.dck,
  theme,
)

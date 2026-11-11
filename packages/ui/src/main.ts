import '@xterm/xterm/css/xterm.css'
import 'virtual:dck-tokens.css'
import './styles.css'
import { openTerminal } from './terminal-session.ts'
import { applyTheme, currentTheme } from './theme.ts'

const host = document.getElementById('host')
if (!host) throw new Error('missing #host element')

const theme = currentTheme()
applyTheme(theme)

window.dck.window.onShown(() => {
  document.body.classList.remove('enter')
  void document.body.offsetWidth
  document.body.classList.add('enter')
})

await openTerminal(host, window.dck, theme)

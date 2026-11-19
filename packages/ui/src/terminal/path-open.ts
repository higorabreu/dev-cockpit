import type { Translate } from '@dck/core'
import type { LinkHint } from './terminal-links.ts'

// Where a Ctrl+clicked file path opens: in the cockpit, over the tab (D84), or in the system's app as D40
// had it. `files.openPathsInCockpit` picks the plain click's side; Shift with it takes the other one
export type PathRoute = 'cockpit' | 'system'

export function pathRoute(inCockpit: boolean, alternate: boolean): PathRoute {
  return inCockpit !== alternate ? 'cockpit' : 'system'
}

// A file's place from a compiler's or a test runner's line, both from 1
export interface FilePlace {
  readonly line?: number
  readonly column?: number
}

export interface PathClick {
  readonly label: string
  readonly alternateLabel: string
}

// The two held clicks on a file path for its tooltip: the plain one says "Open" whichever side the
// setting gives it, the one with Shift names the side it goes to
export function filePathHint(click: PathClick, t: Translate, inCockpit: boolean): LinkHint {
  const name = t('terminal.leftClick')
  const other =
    pathRoute(inCockpit, true) === 'cockpit' ? 'terminal.openInCockpit' : 'files.openExternal'
  return {
    key: click.label,
    gesture: { click: name, action: t('terminal.openPath') },
    alternate: { key: click.alternateLabel, gesture: { click: name, action: t(other) } },
  }
}

// A folder offers its menu with either click
export function folderPathHint(click: PathClick, t: Translate): LinkHint {
  return {
    key: click.label,
    gesture: { click: t('terminal.leftClick'), action: t('terminal.openPath') },
  }
}

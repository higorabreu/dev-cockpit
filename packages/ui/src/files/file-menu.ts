import type { MenuAction, MenuOptions } from '../tabs/tab-menu.ts'

export interface FileMenu {
  readonly actions: readonly MenuAction[]
  readonly options: MenuOptions
}

// The file segment's right click: the tab's other recent files under their caption, then the commands under
// a divider that stays in view; with no other recent file, the commands alone, with no caption or divider
export function fileMenu(
  recent: readonly MenuAction[],
  caption: string,
  commands: readonly MenuAction[],
): FileMenu {
  if (recent.length === 0) return { actions: commands, options: {} }
  return { actions: recent, options: { caption, footer: commands } }
}

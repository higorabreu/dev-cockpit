import { type ProjectCount, projectCounts, type Translator, type ViewItem } from '@dck/core'
import { h } from '../panel/dom.ts'

// More would crowd the bar; any other project is still found by typing its key
const MAX_PROJECTS = 6

export interface ProjectFilterDeps {
  readonly i18n: Translator
  onChange(): void
}

// Toggles for the projects of the open task list: one at a time, a second click clears it
export function createProjectFilter(deps: ProjectFilterDeps) {
  const { t } = deps.i18n
  const element = h('div', { class: 'vprojects', role: 'group', hidden: true })
  let chosen: string | undefined
  let shown: readonly ProjectCount[] = []
  let drawn: string | undefined

  // The chosen project keeps its place even when it is no longer among the most frequent
  function pick(all: readonly ProjectCount[]): readonly ProjectCount[] {
    const top = all.slice(0, MAX_PROJECTS)
    const kept = all.find((entry) => entry.project === chosen)
    if (kept === undefined || top.includes(kept)) return top
    return [...top.slice(0, MAX_PROJECTS - 1), kept]
  }

  function toggle(project: string, event: MouseEvent) {
    chosen = chosen === project ? undefined : project
    // From the keyboard the focus stays on the toggle; a mouse click gives it back to the filter
    if (event.detail === 0) event.stopPropagation()
    deps.onChange()
  }

  function draw() {
    element.setAttribute('aria-label', t('views.projects'))
    const active = document.activeElement
    const focused =
      active instanceof HTMLElement && element.contains(active) ? active.dataset.project : undefined
    element.replaceChildren(
      ...shown.map(({ project, count }) => {
        const button = h(
          'button',
          {
            type: 'button',
            class: 'vbtn vproject',
            'aria-pressed': String(project === chosen),
            'data-project': project,
            'data-tip': t('views.project.only', { project }),
          },
          project,
          h('span', { class: 'vcount' }, String(count)),
        )
        button.addEventListener('click', (event) => toggle(project, event))
        return button
      }),
    )
    if (focused !== undefined)
      element.querySelector<HTMLElement>(`[data-project="${CSS.escape(focused)}"]`)?.focus()
  }

  return {
    element,
    chosen: () => chosen,
    // Called before each filtering with the open tab's items, none on a tab that is not of tasks; a chosen
    // project that left the list is let go, and one project alone needs no toggle
    update(items: readonly ViewItem[]) {
      const all = projectCounts(items)
      if (!all.some((entry) => entry.project === chosen) || all.length < 2) chosen = undefined
      shown = all.length < 2 ? [] : pick(all)
      element.hidden = shown.length === 0
      const signature = JSON.stringify([chosen, shown])
      if (signature === drawn) return
      drawn = signature
      draw()
    },
    reset() {
      chosen = undefined
    },
    retranslate() {
      drawn = undefined
    },
  }
}

import { projectCounts, type Translator, type ViewItem } from '@dck/core'
import { createSelect, type SelectOption } from '../kit/select.ts'
import { h } from '../panel/dom.ts'

// The value of "All projects"; a project key is never empty
const ALL = ''
const LABEL_ID = 'views-project-label'

export interface ProjectSelectDeps {
  readonly i18n: Translator
  onPick(): void
}

// One project of the open task list at a time, every project reachable however many there are
export function createProjectSelect(deps: ProjectSelectDeps) {
  const { t } = deps.i18n
  let chosen: string | undefined
  let drawn: string | undefined
  // The name is read by assistive technology; the closed control already shows what it filters
  const label = h('span', { id: LABEL_ID, hidden: true })
  const select = createSelect({
    id: 'views-project',
    options: [],
    value: ALL,
    labelledBy: LABEL_ID,
    onChange: (value) => {
      chosen = value === ALL ? undefined : value
      deps.onPick()
    },
  })
  const element = h('span', { class: 'vproject', hidden: true }, label, select.element)

  return {
    element,
    button: select.button,
    chosen: () => chosen,
    // Called before each filtering with the open tab's items, none on a tab that is not of tasks; a chosen
    // project that left the list is let go, and one project alone needs no choice
    update(items: readonly ViewItem[]) {
      const counts = projectCounts(items)
      if (counts.length < 2 || !counts.some((entry) => entry.project === chosen)) chosen = undefined
      element.hidden = counts.length < 2
      label.textContent = t('views.project')
      const total = counts.reduce((sum, entry) => sum + entry.count, 0)
      const options: SelectOption[] = [
        { value: ALL, label: t('views.project.all'), detail: String(total) },
        ...counts.map(({ project, count }) => ({
          value: project,
          label: project,
          detail: String(count),
        })),
      ]
      // Redrawing closes an open list, so it happens only when something it shows changed
      const signature = JSON.stringify([chosen, options])
      if (signature === drawn) return
      drawn = signature
      select.setOptions(options)
      select.setValue(chosen ?? ALL)
    },
    reset() {
      chosen = undefined
    },
  }
}

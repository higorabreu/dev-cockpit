const FOCUSABLE = 'button, input, select, textarea, a[href], [tabindex]'

// Undefined means the browser's own Tab order already stays inside, so the key is left alone
export function wrapTarget<T>(
  items: readonly T[],
  current: T | null,
  backwards: boolean,
): T | undefined {
  const first = items[0]
  const last = items.at(-1)
  const index = current === null ? -1 : items.indexOf(current)
  if (index === -1) return backwards ? last : first
  if (backwards && index === 0) return last
  if (!backwards && index === items.length - 1) return first
  return undefined
}

const isTabbable = (element: HTMLElement) =>
  element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0

// Keeps Tab and Shift+Tab cycling inside the container while it is open
export function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isTabbable)
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const target = wrapTarget(items, active, event.shiftKey)
  if (target === undefined && items.length > 0) return
  event.preventDefault()
  target?.focus()
}

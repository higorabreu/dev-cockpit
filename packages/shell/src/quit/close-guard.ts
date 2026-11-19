// Closing the last window quits the app, so it saves the open files first as any quit does: the close
// waits for the window's answer. A quit already under way (the app's own, a logout, a shutdown) closes
// the window at once
export function createCloseGuard(request: () => void) {
  let quitting = false
  return {
    close(event: { preventDefault(): void }) {
      if (quitting) return
      event.preventDefault()
      request()
    },
    quitting() {
      quitting = true
    },
  }
}

export interface TabNotification {
  readonly title: string
  readonly body: string
  // Tab the notification click leads to
  readonly tabId: string
}

export interface Notifier {
  notify(notification: TabNotification): void
}

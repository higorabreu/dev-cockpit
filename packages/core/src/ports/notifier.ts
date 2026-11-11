export interface TabNotification {
  readonly title: string
  readonly body: string
  // Aba para a qual o clique na notificação leva
  readonly tabId: string
}

export interface Notifier {
  notify(notification: TabNotification): void
}

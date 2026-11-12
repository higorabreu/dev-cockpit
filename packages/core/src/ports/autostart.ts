// Start the app with the user session
export interface Autostart {
  isEnabled(): Promise<boolean>
  setEnabled(enabled: boolean): Promise<void>
}

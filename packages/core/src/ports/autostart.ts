// Iniciar o app com a sessão do usuário
export interface Autostart {
  isEnabled(): Promise<boolean>
  setEnabled(enabled: boolean): Promise<void>
}

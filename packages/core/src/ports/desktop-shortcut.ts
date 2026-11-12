// Tecla registrada no próprio sistema, que a restaura a cada login
export interface DesktopShortcut {
  // Falso quando a tecla é inválida, já está em uso ou o sistema recusou
  bind(accelerator: string): Promise<boolean>
}

import type { SystemFontsInfo } from '../fonts/fonts.ts'

// The fonts the system offers and the one the user's own terminal uses
export interface SystemFonts {
  read(): Promise<SystemFontsInfo>
}

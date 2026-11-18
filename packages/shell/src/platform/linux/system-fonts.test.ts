import { describe, expect, it } from 'vitest'
import {
  createLinuxSystemFonts,
  parseFamilies,
  type RunCommand,
  symbolFonts,
} from './system-fonts.ts'

const PROFILE = 'org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/:b1dc/'

// gsettings and fontconfig as a GNOME machine answers them; anything else is missing
function system(answers: Record<string, string>): RunCommand {
  return async (file, args) => answers[[file, ...args].join(' ')]
}

const fontconfig = {
  'fc-list : family': 'Inter,Inter Display\nDejaVu Sans Mono\nMesloLGS NF\nUbuntu\n',
  'fc-list :spacing=mono family': 'MesloLGS NF\nDejaVu Sans Mono\nDejaVu Sans Mono\n',
  'fc-list :charset=e0b0 family': 'MesloLGS NF\n',
}

describe('createLinuxSystemFonts', () => {
  it("should name the font of the user's GNOME Terminal profile when it does not follow the system's", async () => {
    // Arrange
    const fonts = createLinuxSystemFonts(
      system({
        'gsettings get org.gnome.Terminal.ProfilesList default': "'b1dc'\n",
        [`gsettings get ${PROFILE} use-system-font`]: 'false\n',
        [`gsettings get ${PROFILE} font`]: "'MesloLGS NF Regular 12'\n",
        'gsettings get org.gnome.desktop.interface monospace-font-name': "'Ubuntu Mono 13'\n",
        ...fontconfig,
      }),
    )

    // Act
    const info = await fonts.read()

    // Assert
    expect(info).toEqual({
      terminal: 'MesloLGS NF',
      monospace: 'Ubuntu Mono',
      families: ['DejaVu Sans Mono', 'Inter', 'MesloLGS NF', 'Ubuntu'],
      monospaceFamilies: ['DejaVu Sans Mono', 'MesloLGS NF'],
      symbols: ['MesloLGS NF'],
    })
  })

  it('should take the Ptyxis font when GNOME Terminal follows the system font', async () => {
    const fonts = createLinuxSystemFonts(
      system({
        'gsettings get org.gnome.Terminal.ProfilesList default': "'b1dc'\n",
        [`gsettings get ${PROFILE} use-system-font`]: 'true\n',
        'gsettings get org.gnome.Ptyxis use-system-font': 'false\n',
        'gsettings get org.gnome.Ptyxis font-name': "'JetBrainsMono Nerd Font 11'\n",
      }),
    )

    expect((await fonts.read()).terminal).toBe('JetBrainsMono Nerd Font')
  })

  it('should fall back to fontconfig for the monospace font when GNOME names none', async () => {
    const fonts = createLinuxSystemFonts(
      system({ 'fc-match -f %{family[0]} monospace': 'DejaVu Sans Mono' }),
    )

    const info = await fonts.read()

    expect(info).toEqual({
      monospace: 'DejaVu Sans Mono',
      families: [],
      monospaceFamilies: [],
      symbols: [],
    })
  })

  it("should name the font behind GNOME's Monospace alias when that is the system's setting", async () => {
    // Arrange
    const fonts = createLinuxSystemFonts(
      system({
        'gsettings get org.gnome.desktop.interface monospace-font-name': "'Monospace 11'\n",
        'fc-match -f %{family[0]} monospace': 'DejaVu Sans Mono',
      }),
    )

    // Act
    const info = await fonts.read()

    // Assert
    expect(info.monospace).toBe('DejaVu Sans Mono')
  })

  it('should know nothing when no command answers', async () => {
    expect(await createLinuxSystemFonts(async () => undefined).read()).toEqual({
      families: [],
      monospaceFamilies: [],
      symbols: [],
    })
  })
})

describe('symbolFonts', () => {
  it('should put a symbols-only font first, then monospace ones, and keep three when many draw the prompt', () => {
    // Arrange
    const families = ['Fira Code NF', 'Hack Nerd Font Mono', 'MesloLGS NF', 'Symbols Nerd Font']
    const monospace = ['Fira Code NF', 'Hack Nerd Font Mono', 'MesloLGS NF']

    // Act
    const picked = symbolFonts(families, monospace)

    // Assert
    expect(picked).toEqual(['Symbols Nerd Font', 'Fira Code NF', 'Hack Nerd Font Mono'])
  })

  it('should leave out a proportional font when it draws the prompt symbols too', () => {
    // Arrange
    const families = ['Arimo NF', 'Hack Nerd Font Mono', 'MesloLGS NF', 'Symbols Nerd Font']
    const monospace = ['Hack Nerd Font Mono', 'MesloLGS NF']

    // Act
    const picked = symbolFonts(families, monospace)

    // Assert
    expect(picked).toEqual(['Symbols Nerd Font', 'Hack Nerd Font Mono', 'MesloLGS NF'])
  })
})

describe('parseFamilies', () => {
  it('should leave out emoji fonts when fontconfig lists them as monospace', () => {
    expect(parseFamilies('Noto Color Emoji\nNoto Mono\n')).toEqual(['Noto Mono'])
  })

  it('should keep the first name of each line, once, sorted, and drop unsafe ones', () => {
    expect(parseFamilies("B Font,B Alt\nA Font\nB Font\nbad';\n")).toEqual(['A Font', 'B Font'])
  })
})

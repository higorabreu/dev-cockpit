import { execFile } from 'node:child_process'
import {
  familyFromDescription,
  isFontName,
  noSystemFonts,
  type SystemFonts,
  type SystemFontsInfo,
} from '@dck/core'

// Runs a command and gives its output, or undefined when it is missing, fails or takes too long
export type RunCommand = (file: string, args: readonly string[]) => Promise<string | undefined>

const MAX_FAMILIES = 600
// Powerline's branch arrow, which every font made for prompts draws
const POWERLINE_ARROW = 'e0b0'
// Enough for the glyphs a prompt uses without a long list for the browser to try
const MAX_SYMBOL_FONTS = 3
const TIMEOUT_MS = 1500

export const runCommand: RunCommand = (file, args) =>
  new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => resolve(error ? undefined : stdout),
    )
  })
const GNOME_TERMINAL = 'org.gnome.Terminal.Legacy.Profile:/org/gnome/terminal/legacy/profiles:/'

// gsettings prints a string with its quotes: 'MesloLGS NF 12'
const unquote = (value: string | undefined) => value?.trim().replace(/^'(.*)'$/, '$1')

// fontconfig calls a color emoji font monospace, but it draws no text
const EMOJI = /emoji/i

// One family per line, the first of the names fontconfig lists for it
export function parseFamilies(output: string | undefined): readonly string[] {
  const families = new Set<string>()
  for (const line of (output ?? '').split('\n')) {
    const family = line.split(',')[0]?.trim()
    if (family && isFontName(family) && !EMOJI.test(family)) families.add(family)
  }
  return [...families].sort((a, b) => a.localeCompare(b)).slice(0, MAX_FAMILIES)
}

// GNOME Terminal's default profile, then Ptyxis: the font of the one that does not follow the system's
async function terminalFont(run: RunCommand): Promise<string | undefined> {
  const profile = unquote(
    await run('gsettings', ['get', 'org.gnome.Terminal.ProfilesList', 'default']),
  )
  if (profile) {
    const schema = `${GNOME_TERMINAL}:${profile}/`
    if (unquote(await run('gsettings', ['get', schema, 'use-system-font'])) === 'false') {
      const font = unquote(await run('gsettings', ['get', schema, 'font']))
      if (font) return familyFromDescription(font)
    }
  }
  if (unquote(await run('gsettings', ['get', 'org.gnome.Ptyxis', 'use-system-font'])) === 'false') {
    const font = unquote(await run('gsettings', ['get', 'org.gnome.Ptyxis', 'font-name']))
    if (font) return familyFromDescription(font)
  }
  return undefined
}

async function monospaceFont(run: RunCommand): Promise<string | undefined> {
  const gnome = unquote(
    await run('gsettings', ['get', 'org.gnome.desktop.interface', 'monospace-font-name']),
  )
  const family = gnome ? familyFromDescription(gnome) : undefined
  if (family) return family
  const matched = (await run('fc-match', ['-f', '%{family[0]}', 'monospace']))?.trim()
  return matched && isFontName(matched) ? matched : undefined
}

// The fonts that draw the prompt symbols, the ones made only for that first (Symbols Nerd Font), then the
// monospace ones, a patched copy of a terminal font. A proportional font would put its letters in the grid
export function symbolFonts(
  families: readonly string[],
  monospace: readonly string[],
): readonly string[] {
  const symbolsOnly = families.filter((family) => /symbols/i.test(family))
  const mono = families.filter(
    (family) => !symbolsOnly.includes(family) && monospace.includes(family),
  )
  return [...symbolsOnly, ...mono].slice(0, MAX_SYMBOL_FONTS)
}

export function createLinuxSystemFonts(run: RunCommand): SystemFonts {
  return {
    async read(): Promise<SystemFontsInfo> {
      const [terminal, monospace, all, mono, symbols] = await Promise.all([
        terminalFont(run),
        monospaceFont(run),
        run('fc-list', [':', 'family']),
        run('fc-list', [':spacing=mono', 'family']),
        run('fc-list', [`:charset=${POWERLINE_ARROW}`, 'family']),
      ])
      const monospaceFamilies = parseFamilies(mono)
      return {
        ...noSystemFonts,
        ...(terminal ? { terminal } : {}),
        ...(monospace ? { monospace } : {}),
        families: parseFamilies(all),
        monospaceFamilies,
        symbols: symbolFonts(parseFamilies(symbols), monospaceFamilies),
      }
    },
  }
}

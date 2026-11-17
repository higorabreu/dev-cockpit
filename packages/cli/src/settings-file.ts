import { parseSettings, type Settings } from '@dck/core'

// Undefined when the text is not JSON
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return undefined
  }
}

// The window's settings.json; a missing or corrupted file reads as the defaults, as the window treats it
export function settingsFromText(text: string | undefined): Settings {
  return parseSettings(text === undefined ? {} : parseJson(text))
}

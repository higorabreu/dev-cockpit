// Where a text stops being valid, counted from 1 as editors show it
export interface TextPosition {
  readonly line: number
  readonly column: number
}

export type SettingsTextRead =
  | { readonly kind: 'ok'; readonly value: Readonly<Record<string, unknown>> }
  | { readonly kind: 'invalid'; readonly at: TextPosition }

// One value to set at a path of keys; undefined removes the key
export interface SettingsEdit {
  readonly path: readonly string[]
  readonly value: unknown
}

// The text of a settings file as people write it: JSON with comments and trailing commas
export interface SettingsText {
  // A blank text reads as an empty object; anything that is not an object is invalid
  read(text: string): SettingsTextRead
  // Changes only the edited values and keeps the comments, order and layout of the rest
  edit(text: string, edits: readonly SettingsEdit[]): string
}

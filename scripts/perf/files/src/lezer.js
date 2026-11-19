// Syntax colors through CodeMirror's own grammars: the language comes from the file name through
// @codemirror/language-data, which loads a Lezer package (or a legacy mode) on first use.
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { tags as t } from '@lezer/highlight'

export { ensureSyntaxTree, syntaxTree } from '@codemirror/language'

// VS Code's Dark Modern and Light Modern token colors (their tokenColors are Dark+ and Light+), mapped to
// Lezer's tags, so the screenshots compare grammars and not palettes
const palettes = {
  dark: {
    fg: '#cccccc',
    control: '#c586c0',
    storage: '#569cd6',
    variable: '#9cdcfe',
    fn: '#dcdcaa',
    type: '#4ec9b0',
    string: '#ce9178',
    number: '#b5cea8',
    comment: '#6a9955',
    regexp: '#d16969',
    escape: '#d7ba7d',
    operator: '#d4d4d4',
  },
  light: {
    fg: '#3b3b3b',
    control: '#af00db',
    storage: '#0000ff',
    variable: '#001080',
    fn: '#795e26',
    type: '#267f99',
    string: '#a31515',
    number: '#098658',
    comment: '#008000',
    regexp: '#811f3f',
    escape: '#ee0000',
    operator: '#000000',
  },
}

export function lezerStyle(theme) {
  const c = palettes[theme]
  return syntaxHighlighting(
    HighlightStyle.define([
      { tag: [t.controlKeyword, t.moduleKeyword], color: c.control },
      {
        tag: [
          t.keyword,
          t.definitionKeyword,
          t.modifier,
          t.operatorKeyword,
          t.self,
          t.bool,
          t.null,
        ],
        color: c.storage,
      },
      { tag: [t.atom, t.special(t.variableName)], color: c.storage },
      { tag: [t.variableName, t.propertyName, t.attributeName], color: c.variable },
      {
        tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
        color: c.fn,
      },
      { tag: [t.typeName, t.className, t.namespace, t.tagName], color: c.type },
      { tag: [t.string, t.special(t.string), t.character], color: c.string },
      { tag: [t.number, t.integer, t.float], color: c.number },
      { tag: t.comment, color: c.comment },
      { tag: t.regexp, color: c.regexp },
      { tag: t.escape, color: c.escape },
      { tag: [t.operator, t.punctuation], color: c.operator },
      { tag: t.meta, color: c.fn },
      { tag: t.invalid, color: c.regexp },
    ]),
  )
}

export async function lezerLanguage(fileName) {
  const found = languages.find((language) =>
    language.extensions.some((extension) => fileName.endsWith(`.${extension}`)),
  )
  if (!found) return undefined
  const support = await found.load()
  return { name: found.name, support }
}

import {
  HighlightStyle,
  LanguageSupport,
  LRLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { styleTags, tags as t } from '@lezer/highlight'

const role = (name: string) => `var(--syntax-${name})`

// Lezer's tags onto the roles of tokens.json (`syntax.*`), so a theme changes the colors without a line
// of code. A more specific tag wins over a general one (a called method over a property)
export const syntaxColors = syntaxHighlighting(
  HighlightStyle.define([
    { tag: [t.variableName, t.labelName, t.content], color: role('variable') },
    {
      tag: [t.definitionKeyword, t.modifier, t.keyword, t.tagName],
      color: role('storage'),
    },
    {
      tag: [t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.meta],
      color: role('control'),
    },
    { tag: [t.self, t.bool, t.null, t.atom, t.constant(t.variableName)], color: role('constant') },
    { tag: [t.typeName, t.className, t.namespace], color: role('type') },
    {
      tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
      color: role('function'),
    },
    {
      tag: [t.string, t.special(t.string), t.character, t.regexp, t.escape, t.attributeValue],
      color: role('string'),
    },
    { tag: [t.monospace], color: role('string') },
    { tag: [t.number, t.integer, t.float, t.unit], color: role('number') },
    { tag: [t.propertyName, t.attributeName], color: role('property') },
    { tag: [t.operator], color: role('operator') },
    {
      tag: [t.punctuation, t.separator, t.bracket, t.derefOperator, t.angleBracket, t.list],
      color: role('punctuation'),
    },
    { tag: [t.comment, t.quote], color: role('comment') },
    { tag: [t.heading], color: role('storage'), fontWeight: '600' },
    { tag: [t.link, t.url], color: role('string'), textDecoration: 'underline' },
    { tag: [t.strong], fontWeight: '600' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.strikethrough], textDecoration: 'line-through' },
    { tag: [t.invalid], color: role('invalid') },
  ]),
)

// JavaScript's grammar tags a method's name where it is declared as a property; the palette colors
// function names where they are declared too, as a call already is
const METHOD_NAMES = styleTags({
  'MethodDeclaration/PropertyDefinition': t.function(t.definition(t.propertyName)),
})
const SCRIPTS = new Set(['JavaScript', 'TypeScript', 'JSX', 'TSX'])

// The grammar for a file by its name, loaded on first use: a Lezer package, or a legacy mode for the
// languages without one; undefined for a name no language claims
export async function languageFor(path: string): Promise<LanguageSupport | undefined> {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const lower = name.toLowerCase()
  const found = languages.find(
    (language) =>
      language.filename?.test(name) === true ||
      language.extensions.some((extension) => lower.endsWith(`.${extension}`)),
  )
  const support = await found?.load()
  if (!support || !found || !SCRIPTS.has(found.name) || !(support.language instanceof LRLanguage))
    return support
  return new LanguageSupport(support.language.configure({ props: [METHOD_NAMES] }), support.support)
}

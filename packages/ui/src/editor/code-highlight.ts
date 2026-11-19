import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { highlightTree } from '@lezer/highlight'
import { cockpitHighlight } from './editor-syntax.ts'

// A code block of the Markdown preview colored as the editor colors the same language: the language's
// Lezer grammar (loaded on first use) and the editor's highlight style, whose classes the open Markdown
// editor has already put in the page. Undefined for a language no grammar claims
export async function highlightCode(
  code: string,
  name: string,
): Promise<DocumentFragment | undefined> {
  const found = LanguageDescription.matchLanguageName(languages, name, true)
  const support = await found?.load().catch(() => undefined)
  if (!support) return undefined
  const fragment = document.createDocumentFragment()
  let at = 0
  const plain = (to: number) => {
    if (to > at) fragment.append(code.slice(at, to))
    at = to
  }
  highlightTree(support.language.parser.parse(code), cockpitHighlight, (from, to, classes) => {
    plain(from)
    const span = document.createElement('span')
    span.className = classes
    span.textContent = code.slice(from, to)
    fragment.append(span)
    at = to
  })
  plain(code.length)
  return fragment
}

import type { Translate } from '@dck/core'
import type { SearchTexts } from '../editor/editor-search.ts'

// CodeMirror's own words, from the catalogs: the go to line bar and what a screen reader hears
export const editorPhrases = (t: Translate): Record<string, string> => ({
  'Go to line': t('files.phrase.goToLine'),
  go: t('files.phrase.go'),
  'current match': t('files.phrase.currentMatch'),
  'on line': t('files.phrase.onLine'),
  'replaced $ matches': t('files.phrase.replacedMatches'),
  'replaced match on line $': t('files.phrase.replacedOnLine'),
})

export const searchTexts = (t: Translate): SearchTexts => ({
  find: t('files.search.find'),
  replace: t('files.search.replace'),
  next: t('files.search.next'),
  previous: t('files.search.previous'),
  matchCase: t('files.search.case'),
  wholeWord: t('files.search.word'),
  regexp: t('files.search.regexp'),
  replaceOne: t('files.search.replaceOne'),
  replaceAll: t('files.search.replaceAll'),
  toggleReplace: t('files.search.toggleReplace'),
  close: t('files.search.close'),
  none: t('files.search.none'),
  invalid: t('files.search.invalid'),
  count: (current, total, more) =>
    t(more ? 'files.search.countMany' : 'files.search.count', { current, total }),
})

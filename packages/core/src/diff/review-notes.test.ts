import { describe, expect, it } from 'vitest'
import { createTranslator } from '../i18n/translator.ts'
import {
  pathFrom,
  REVIEW_NOTES_PREFIX,
  REVIEW_NOTES_TEMP_PREFIX,
  reviewNoteName,
  reviewPrompt,
  reviewStamp,
  staleReviewNotes,
} from './review-notes.ts'

describe('reviewStamp', () => {
  it('should write the local date and time so the names sort by when they were written', () => {
    const stamp = reviewStamp(new Date(2026, 10, 7, 9, 5, 3))

    expect(stamp).toBe('20261107-090503')
    expect(reviewNoteName(REVIEW_NOTES_PREFIX, stamp)).toBe('review-20261107-090503.md')
    expect(reviewNoteName(REVIEW_NOTES_PREFIX, stamp, 2)).toBe('review-20261107-090503-2.md')
  })
})

describe('staleReviewNotes', () => {
  it('should keep the newest five review files and leave other files alone', () => {
    // Arrange
    const names = [
      'review-20261117-100000.md',
      'review-20261117-100500.md',
      'review-20261117-100500-2.md',
      'review-20261117-090000.md',
      'review-20261116-235959.md',
      'review-20261117-110000.md',
      'notes.md',
      'review-draft.md',
      '.review-20261117-120000.md.42.tmp',
    ]

    // Act
    const stale = staleReviewNotes(names, REVIEW_NOTES_PREFIX)

    // Assert
    expect(stale).toEqual(['review-20261116-235959.md'])
  })

  it('should only count the files with its own prefix when the folder is shared', () => {
    const names = Array.from({ length: 7 }, (_, index) => `dck-review-20261117-10000${index}.md`)

    expect(
      staleReviewNotes([...names, 'review-20261117-100000.md'], REVIEW_NOTES_TEMP_PREFIX),
    ).toEqual(['dck-review-20261117-100001.md', 'dck-review-20261117-100000.md'])
  })
})

describe('pathFrom', () => {
  it('should give the path from the folder when the file is inside it', () => {
    expect(pathFrom('/home/ana/acme/backend', '/home/ana/acme/backend/.git/dck/review-1.md')).toBe(
      '.git/dck/review-1.md',
    )
    expect(pathFrom('/home/ana/acme/backend/', '/home/ana/acme/backend/.git/x.md')).toBe(
      '.git/x.md',
    )
    expect(pathFrom('C:\\acme', 'C:\\acme\\.git\\dck\\r.md')).toBe('.git\\dck\\r.md')
  })

  it('should keep the absolute path when the file is outside the folder', () => {
    expect(pathFrom('/home/ana/acme/backend/src', '/home/ana/acme/backend/.git/r.md')).toBe(
      '/home/ana/acme/backend/.git/r.md',
    )
    expect(pathFrom('/home/ana/acme/back', '/home/ana/acme/backend/r.md')).toBe(
      '/home/ana/acme/backend/r.md',
    )
    expect(pathFrom('/home/ana', '/home/ana')).toBe('/home/ana')
  })
})

describe('reviewPrompt', () => {
  it('should name the file in one line in the interface language', () => {
    expect(reviewPrompt(createTranslator('en').t, '.git/dck/review-20261117-143000.md')).toBe(
      'Address the review comments in .git/dck/review-20261117-143000.md',
    )
    expect(reviewPrompt(createTranslator('pt-BR').t, '/tmp/dck-review-20261117-143000.md')).toBe(
      'Resolva os comentários da revisão em /tmp/dck-review-20261117-143000.md',
    )
  })

  it('should quote the path for a shell when it has a space', () => {
    expect(reviewPrompt(createTranslator('en').t, '/home/ana/my repo/.git/dck/r.md')).toBe(
      "Address the review comments in '/home/ana/my repo/.git/dck/r.md'",
    )
  })
})

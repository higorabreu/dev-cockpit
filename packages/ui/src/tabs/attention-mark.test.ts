import { createTranslator } from '@dck/core'
import { describe, expect, it } from 'vitest'
import { attentionMark, reviewMark, strongestMark } from './attention-mark.ts'

describe('attentionMark', () => {
  it('should give the needs you mark its own shape and name when an agent needs the user', () => {
    const mark = attentionMark('needs-you', createTranslator('en').t)

    expect(mark).toEqual({ className: 'pip needs-you', label: 'needs you' })
  })

  it('should keep the finished dot and its name when something finished', () => {
    const mark = attentionMark('finished', createTranslator('en').t)

    expect(mark).toEqual({ className: 'pip', label: 'finished' })
  })

  it('should name the needs you mark in portuguese when the interface is in portuguese', () => {
    expect(attentionMark('needs-you', createTranslator('pt-BR').t).label).toBe('precisa de você')
  })
})

describe('strongestMark', () => {
  it('should pick needs you when hidden tabs need the user and others finished', () => {
    expect(strongestMark(['finished', 'needs-you', 'finished'])).toBe('needs-you')
  })

  it('should pick finished when no hidden tab needs the user', () => {
    expect(strongestMark(['finished'])).toBe('finished')
  })

  it('should pick nothing when no tab is marked', () => {
    expect(strongestMark([])).toBeUndefined()
  })
})

describe('reviewMark', () => {
  it('should name the open review in both languages when a tab hides it behind its terminal', () => {
    expect(reviewMark(createTranslator('en').t)).toEqual({
      className: 'pip review',
      label: 'Review open',
    })
    expect(reviewMark(createTranslator('pt-BR').t).label).toBe('Revisão aberta')
  })
})

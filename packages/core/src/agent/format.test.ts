import { describe, expect, it } from 'vitest'
import { contextPercentage, tokenScale } from './format.ts'

describe('tokenScale', () => {
  it('should keep the number when it is under a thousand', () => {
    expect(tokenScale(850)).toEqual({ unit: 'raw', value: 850 })
  })

  it('should round to thousands when it is under a million', () => {
    expect(tokenScale(639_726)).toEqual({ unit: 'thousand', value: 640 })
  })

  it('should keep one decimal in millions when it is a million or more', () => {
    expect(tokenScale(1_240_000)).toEqual({ unit: 'million', value: 1.2 })
  })
})

describe('contextPercentage', () => {
  it('should round the share of the window that is used', () => {
    expect(contextPercentage(124_000, 200_000)).toBe(62)
  })

  it('should cap at one hundred when the tokens exceed the window', () => {
    expect(contextPercentage(300_000, 200_000)).toBe(100)
  })

  it('should be undefined when the window is not known', () => {
    expect(contextPercentage(1000, 0)).toBeUndefined()
  })
})

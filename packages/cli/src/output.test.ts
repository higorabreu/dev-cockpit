import { describe, expect, it } from 'vitest'
import { printable, printableText } from './output.ts'

describe('printable', () => {
  it('should replace an ESC sequence, a C1 CSI and a bidi override when a text carries them', () => {
    const text = printable('\u001b[2Jfeat\u009b31m\u202egol\u2066x\u2069\n\t\u007f')

    expect(text).toBe('?[2Jfeat?31m?gol?x????')
  })

  it('should keep the line breaks and tabs and replace the rest when the text has several lines', () => {
    const text = printableText('## Title\u001b[2J\n\tBody\u009b31m\u202e\r\n')

    expect(text).toBe('## Title?[2J\n\tBody?31m??\n')
  })
})

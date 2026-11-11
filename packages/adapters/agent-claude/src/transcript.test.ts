import { describe, expect, it } from 'vitest'
import { summarizeTranscriptTail } from './transcript.ts'

const assistant = (extra: Record<string, unknown> = {}, usage: Record<string, number> = {}) =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-11T20:00:00.000Z',
    message: {
      model: 'claude-sonnet-5-5',
      usage: {
        input_tokens: 4,
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 600_000,
        ...usage,
      },
      content: [{ type: 'text', text: 'NÃO DEVE SAIR DAQUI' }],
    },
    ...extra,
  })

const lines = (...entries: string[]) => entries.join('\n')

describe('summarizeTranscriptTail', () => {
  it('should add input, cache creation and cache read tokens when reading the context', () => {
    const summary = summarizeTranscriptTail(lines(assistant()))

    expect(summary.contextTokens).toBe(601_004)
    expect(summary.model).toBe('claude-sonnet-5-5')
  })

  it('should use the most recent response when there are several', () => {
    const older = assistant(
      { timestamp: '2026-11-11T10:00:00.000Z' },
      { cache_read_input_tokens: 100 },
    )
    const newer = assistant(
      { timestamp: '2026-11-11T20:00:00.000Z' },
      { cache_read_input_tokens: 900 },
    )

    const summary = summarizeTranscriptTail(lines(older, newer))

    expect(summary.contextTokens).toBe(4 + 1000 + 900)
    expect(summary.lastResponseAt).toBe(Date.parse('2026-11-11T20:00:00.000Z'))
  })

  it('should ignore responses from subagents when reading the main context', () => {
    const main = assistant({}, { cache_read_input_tokens: 500 })
    const side = assistant({ isSidechain: true }, { cache_read_input_tokens: 9_000_000 })

    expect(summarizeTranscriptTail(lines(main, side)).contextTokens).toBe(4 + 1000 + 500)
  })

  it('should ignore synthetic responses when they have no real usage', () => {
    const real = assistant({}, { cache_read_input_tokens: 700 })
    const synthetic = JSON.stringify({
      type: 'assistant',
      message: { model: '<synthetic>', usage: { input_tokens: 0 } },
    })

    expect(summarizeTranscriptTail(lines(real, synthetic)).contextTokens).toBe(4 + 1000 + 700)
  })

  it('should read the latest title and permission mode when they appear', () => {
    const text = lines(
      JSON.stringify({ type: 'ai-title', aiTitle: 'Antigo' }),
      JSON.stringify({ type: 'ai-title', aiTitle: 'Painel lateral' }),
      JSON.stringify({ type: 'permission-mode', permissionMode: 'acceptEdits' }),
    )

    expect(summarizeTranscriptTail(text)).toMatchObject({
      title: 'Painel lateral',
      permissionMode: 'acceptEdits',
    })
  })

  it('should skip lines that are not json and unknown shapes when reading', () => {
    const text = lines(
      '{"type":"assistant", broken',
      JSON.stringify({ type: 'assistant', message: 'oops' }),
      assistant(),
    )

    expect(summarizeTranscriptTail(text).contextTokens).toBe(601_004)
  })

  it('should never carry the conversation text when summarizing', () => {
    const summary = summarizeTranscriptTail(lines(assistant()))

    expect(JSON.stringify(summary)).not.toContain('NÃO DEVE SAIR')
  })

  it('should return nothing when the text has no usable line', () => {
    expect(summarizeTranscriptTail('')).toEqual({})
    expect(summarizeTranscriptTail(lines(JSON.stringify({ type: 'user' })))).toEqual({})
  })
})

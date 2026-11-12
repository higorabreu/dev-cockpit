import { describe, expect, it } from 'vitest'
import { hasBlock, MARKDOWN_BLOCK, removeBlock, SHELL_BLOCK, upsertBlock } from './block.ts'

const START = '<!-- dck:start -->'
const END = '<!-- dck:end -->'

describe('upsertBlock', () => {
  it('should return just the block when the file is empty', () => {
    const text = upsertBlock('', 'Run `dck guide branch`.', MARKDOWN_BLOCK)

    expect(text).toBe(`${START}\nRun \`dck guide branch\`.\n${END}\n`)
  })

  it('should append the block after one blank line when the file has none', () => {
    const text = upsertBlock('# Agents\n\nBe brief.\n', 'New', MARKDOWN_BLOCK)

    expect(text).toBe(`# Agents\n\nBe brief.\n\n${START}\nNew\n${END}\n`)
  })

  it('should append the block the same way when the file does not end with a newline', () => {
    const text = upsertBlock('# Agents', 'New', MARKDOWN_BLOCK)

    expect(text).toBe(`# Agents\n\n${START}\nNew\n${END}\n`)
  })

  it('should replace the block in place when the file already has one', () => {
    const before = `# Agents\n\n${START}\nOld one\nOld two\n${END}\n\n## Mine\n\nKeep this.\n`

    const text = upsertBlock(before, 'New', MARKDOWN_BLOCK)

    expect(text).toBe(`# Agents\n\n${START}\nNew\n${END}\n\n## Mine\n\nKeep this.\n`)
  })

  it('should give the same text when the same block is written twice', () => {
    const once = upsertBlock('# Agents\n', 'New', MARKDOWN_BLOCK)

    const twice = upsertBlock(once, 'New', MARKDOWN_BLOCK)

    expect(twice).toBe(once)
  })

  it('should use the shell markers when the file is a hook script', () => {
    const text = upsertBlock('#!/bin/sh\nset -e\n', 'dck check commit "$1"', SHELL_BLOCK)

    expect(text).toBe('#!/bin/sh\nset -e\n\n# dck:start\ndck check commit "$1"\n# dck:end\n')
  })

  it('should find the block when the file uses Windows line endings', () => {
    const before = `# Agents\r\n\r\n${START}\r\nOld\r\n${END}\r\n`

    const text = upsertBlock(before, 'New', MARKDOWN_BLOCK)

    expect(text).toBe(`# Agents\r\n\r\n${START}\nNew\n${END}\n`)
  })
})

describe('removeBlock', () => {
  it('should restore the original text when the block was appended', () => {
    const original = '# Agents\n\nBe brief.\n'
    const withBlock = upsertBlock(original, 'New', MARKDOWN_BLOCK)

    const text = removeBlock(withBlock, MARKDOWN_BLOCK)

    expect(text).toBe(original)
  })

  it('should keep the text on both sides when the block is in the middle', () => {
    const before = `# Agents\n\n${START}\nOld\n${END}\n\n## Mine\n\nKeep this.\n`

    const text = removeBlock(before, MARKDOWN_BLOCK)

    expect(text).toBe('# Agents\n\n## Mine\n\nKeep this.\n')
  })

  it('should return an empty text when the file held only the block', () => {
    const text = removeBlock(upsertBlock('', 'New', SHELL_BLOCK), SHELL_BLOCK)

    expect(text).toBe('')
  })

  it('should return the text untouched when it has no block', () => {
    const text = removeBlock('# Agents\n\n\nNo final newline', MARKDOWN_BLOCK)

    expect(text).toBe('# Agents\n\n\nNo final newline')
  })
})

describe('hasBlock', () => {
  it('should tell a file with a block from one without when asked', () => {
    const withBlock = upsertBlock('# Agents\n', 'New', MARKDOWN_BLOCK)

    expect(hasBlock(withBlock, MARKDOWN_BLOCK)).toBe(true)
    expect(hasBlock(withBlock, SHELL_BLOCK)).toBe(false)
    expect(hasBlock(`# Agents\n${START}\n`, MARKDOWN_BLOCK)).toBe(false)
  })
})

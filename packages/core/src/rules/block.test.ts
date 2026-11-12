import { describe, expect, it } from 'vitest'
import { blockText, removeBlock, upsertBlock } from './block.ts'

const START = '<!-- dck:start -->'
const END = '<!-- dck:end -->'

describe('upsertBlock', () => {
  it('should return just the block when the file is empty', () => {
    const text = upsertBlock('', 'Run `dck guide branch`.')

    expect(text).toBe(`${START}\nRun \`dck guide branch\`.\n${END}\n`)
  })

  it('should append the block after one blank line when the file has none', () => {
    const text = upsertBlock('# Agents\n\nBe brief.\n', 'New')

    expect(text).toBe(`# Agents\n\nBe brief.\n\n${START}\nNew\n${END}\n`)
  })

  it('should append the block the same way when the file does not end with a newline', () => {
    const text = upsertBlock('# Agents', 'New')

    expect(text).toBe(`# Agents\n\n${START}\nNew\n${END}\n`)
  })

  it('should replace the block in place when the file already has one', () => {
    const before = `# Agents\n\n${START}\nOld one\nOld two\n${END}\n\n## Mine\n\nKeep this.\n`

    const text = upsertBlock(before, 'New')

    expect(text).toBe(`# Agents\n\n${START}\nNew\n${END}\n\n## Mine\n\nKeep this.\n`)
  })

  it('should give the same text when the same block is written twice', () => {
    const once = upsertBlock('# Agents\n', 'New')

    const twice = upsertBlock(once, 'New')

    expect(twice).toBe(once)
  })

  it('should find the block and keep the other lines as they were when the file uses Windows line endings', () => {
    const before = `# Agents\r\n\r\n${START}\r\nOld\r\n${END}\r\n## Mine\r\n`

    const text = upsertBlock(before, 'New')

    expect(text).toBe(`# Agents\r\n\r\n${START}\nNew\n${END}\n## Mine\r\n`)
  })

  it('should return the text unchanged when the block already says the same, even with no final newline', () => {
    const before = `# Agents\r\n\r\n${START}\r\nSame\r\n${END}`

    const text = upsertBlock(before, 'Same')

    expect(text).toBe(before)
  })

  it('should keep the text after a stray start and replace only the paired block when a start has no end of its own', () => {
    const before = `# Agents\n${START}\nMy own notes.\n\n${START}\nOld\n${END}\n`

    const text = upsertBlock(before, 'New')

    expect(text).toBe(`# Agents\n${START}\nMy own notes.\n\n${START}\nNew\n${END}\n`)
  })

  it('should leave a lone start and the text after it alone and append the block when no end follows', () => {
    const before = `# Agents\n${START}\nMy own notes.\n`

    const text = upsertBlock(before, 'New')

    expect(text).toBe(`# Agents\n${START}\nMy own notes.\n\n${START}\nNew\n${END}\n`)
  })

  it('should ignore the markers when they are inside a fenced code block', () => {
    const before = `# Agents\n\n\`\`\`markdown\n${START}\nAn example.\n${END}\n\`\`\`\n`

    const text = upsertBlock(before, 'New')

    expect(text).toBe(`${before}\n${START}\nNew\n${END}\n`)
  })
})

describe('removeBlock', () => {
  it('should restore the original text when the block was appended', () => {
    const original = '# Agents\n\nBe brief.\n'
    const withBlock = upsertBlock(original, 'New')

    const text = removeBlock(withBlock)

    expect(text).toBe(original)
  })

  it('should keep the text on both sides when the block is in the middle', () => {
    const before = `# Agents\n\n${START}\nOld\n${END}\n\n## Mine\n\nKeep this.\n`

    const text = removeBlock(before)

    expect(text).toBe('# Agents\n\n## Mine\n\nKeep this.\n')
  })

  it('should return an empty text when the file held only the block', () => {
    const text = removeBlock(upsertBlock('', 'New'))

    expect(text).toBe('')
  })

  it('should return the text untouched when it has no block', () => {
    const text = removeBlock('# Agents\n\n\nNo final newline')

    expect(text).toBe('# Agents\n\n\nNo final newline')
  })

  it('should keep the text after a lone start when there is no end', () => {
    const before = `# Agents\n${START}\nMy own notes.\n`

    expect(removeBlock(before)).toBe(before)
  })
})

describe('blockText', () => {
  it('should give the lines between the markers without carriage returns when the file has a block', () => {
    const text = `# Agents\r\n${START}\r\nOne\r\nTwo\r\n${END}`

    expect(blockText(text)).toBe('One\nTwo')
  })

  it('should be undefined when the file has no complete block or only one in a fence', () => {
    expect(blockText(`# Agents\n${START}\n`)).toBeUndefined()
    expect(blockText(`\`\`\`\n${START}\n${END}\n\`\`\`\n`)).toBeUndefined()
  })
})

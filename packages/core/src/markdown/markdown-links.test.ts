import { describe, expect, it } from 'vitest'
import { headingLines, headingSlug } from './markdown-headings.ts'
import { imageSource, isInside, linkTarget, parentFolder } from './markdown-links.ts'

const README = '/home/ana/acme/docs/README.md'

describe('linkTarget', () => {
  it('should send an http or https link to the browser when it has a scheme', () => {
    expect(linkTarget('https://example.com/a?b=1', README)).toEqual({
      kind: 'external',
      url: 'https://example.com/a?b=1',
    })
    expect(linkTarget('HTTP://example.com', README)).toMatchObject({ kind: 'external' })
  })

  it.each([
    'javascript:alert(1)',
    'mailto:ana@example.com',
    'data:text/html,x',
    'file:///etc/passwd',
  ])('should lead nowhere when the link is %s', (href) => {
    expect(linkTarget(href, README)).toEqual({ kind: 'none' })
  })

  it('should scroll to a heading when the link is only an anchor', () => {
    expect(linkTarget('#Getting-Started', README)).toEqual({
      kind: 'anchor',
      slug: 'getting-started',
    })
    expect(linkTarget('#', README)).toEqual({ kind: 'none' })
  })

  it('should open another file against the Markdown file folder when the link is relative', () => {
    expect(linkTarget('../src/main.ts#L12', README)).toEqual({
      kind: 'file',
      path: '/home/ana/acme/src/main.ts',
      line: 12,
    })
    expect(linkTarget('./setup%20guide.md#install', README)).toEqual({
      kind: 'file',
      path: '/home/ana/acme/docs/setup guide.md',
    })
    expect(linkTarget('/etc/hosts', README)).toEqual({ kind: 'file', path: '/etc/hosts' })
  })

  it('should lead nowhere when a relative link climbs above the root', () => {
    expect(linkTarget('../../../../../x.md', README)).toEqual({ kind: 'none' })
  })

  it('should keep the Windows separator when the Markdown file has a Windows path', () => {
    expect(linkTarget('..\\src\\a.ts', 'C:\\acme\\docs\\README.md')).toEqual({
      kind: 'file',
      path: 'C:\\acme\\src\\a.ts',
    })
  })
})

describe('imageSource', () => {
  it('should draw an image under the Markdown file folder when its path is relative', () => {
    expect(imageSource('img/shot.png', README)).toEqual({
      kind: 'local',
      path: '/home/ana/acme/docs/img/shot.png',
    })
    expect(imageSource('./logo.svg?raw=1', README)).toEqual({
      kind: 'local',
      path: '/home/ana/acme/docs/logo.svg',
    })
  })

  it('should draw nothing when the image is outside the folder, not an image or a PDF', () => {
    expect(imageSource('../logo.png', README)).toEqual({ kind: 'none' })
    expect(imageSource('/home/ana/acme/docs/../logo.png', README)).toEqual({ kind: 'none' })
    expect(imageSource('notes.txt', README)).toEqual({ kind: 'none' })
    expect(imageSource('manual.pdf', README)).toEqual({ kind: 'none' })
  })

  it('should keep a remote image apart when its address is https', () => {
    expect(imageSource('https://example.com/badge.svg', README)).toEqual({
      kind: 'remote',
      url: 'https://example.com/badge.svg',
    })
  })

  it('should take an inline image and refuse any other scheme when the source has one', () => {
    expect(imageSource('data:image/png;base64,AAAA', README)).toEqual({ kind: 'inline' })
    expect(imageSource('data:text/html,<b>', README)).toEqual({ kind: 'none' })
    expect(imageSource('http://example.com/a.png', README)).toEqual({ kind: 'none' })
    expect(imageSource('file:///home/ana/a.png', README)).toEqual({ kind: 'none' })
  })
})

describe('paths', () => {
  it('should give the folder of a file and tell a path inside it when asked', () => {
    expect(parentFolder(README)).toBe('/home/ana/acme/docs')
    expect(parentFolder('/README.md')).toBe('/')
    expect(isInside('/home/ana/acme', '/home/ana/acme/a.png')).toBe(true)
    expect(isInside('/home/ana/acme', '/home/ana/acme-old/a.png')).toBe(false)
  })
})

describe('headingLines', () => {
  it('should list ATX and setext headings when they are outside fenced code', () => {
    const text = [
      '# Acme',
      '',
      'Intro text',
      'Setup',
      '=====',
      '',
      '```sh',
      '# not a heading',
      '```',
      '- item',
      '---',
      '',
      '## Usage ##',
    ].join('\n')

    expect(headingLines(text)).toEqual([0, 2, 12])
  })

  it('should leave a tilde fence open until a fence of the same kind closes it', () => {
    expect(headingLines('~~~\n```\n# inside\n~~~\n# out')).toEqual([4])
  })
})

describe('headingSlug', () => {
  it('should make GitHub anchors and number a repeated one when headings share a name', () => {
    const taken = new Map<string, number>()

    expect(headingSlug('Getting Started!', taken)).toBe('getting-started')
    expect(headingSlug('Getting started', taken)).toBe('getting-started-1')
    expect(headingSlug('Configuração (v2)', taken)).toBe('configuração-v2')
  })
})

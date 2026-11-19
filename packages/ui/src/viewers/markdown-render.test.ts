// @vitest-environment happy-dom
import { Marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { classify, PENDING_SRC } from './markdown-render.ts'

const README = '/home/ana/acme/docs/README.md'

// What DOMPurify hands over, its images already holding their address aside (its own sanitizing runs in
// the app; happy-dom's parser is not one DOMPurify supports)
function sanitized(text: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = new Marked({ gfm: true, async: false })
    .parse(text, { async: false })
    .replace(/<img src=/g, `<img ${PENDING_SRC}=`)
  return template.content
}

describe('classify', () => {
  it('should anchor headings and draw task boxes when the file uses GitHub Markdown', () => {
    // Arrange
    const text = ['# Acme', '', '## Setup', '', '## Setup', '', '- [x] done', '- [ ] open'].join(
      '\n',
    )

    // Act
    const { fragment } = classify(sanitized(text), README)

    // Assert
    const anchors = [...fragment.querySelectorAll('[data-md-anchor]')]
    expect(anchors.map((heading) => heading.getAttribute('data-md-anchor'))).toEqual([
      'acme',
      'setup',
      'setup-1',
    ])
    const tasks = [...fragment.querySelectorAll('.md-task')]
    expect(tasks.map((task) => task.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect(fragment.querySelector('input')).toBeNull()
  })

  it('should keep every image from loading and sort it by its source when the file has images', () => {
    // Arrange
    const text = [
      '![shot](img/shot.png)',
      '![badge](https://img.example.com/badge.svg)',
      '![out](../secret.png)',
      '![plain](http://example.com/a.png)',
      '![dot](data:image/png;base64,AAAA)',
    ].join('\n\n')

    // Act
    const { fragment, locals, remotes } = classify(sanitized(text), README)

    // Assert
    expect(locals.map((local) => local.path)).toEqual(['/home/ana/acme/docs/img/shot.png'])
    expect(remotes.map((remote) => remote.url)).toEqual(['https://img.example.com/badge.svg'])
    for (const { element } of [...locals, ...remotes])
      expect(element.hasAttribute('src')).toBe(false)
    expect([...fragment.querySelectorAll('img')].map((image) => image.alt)).toEqual([
      'shot',
      'badge',
      'dot',
    ])
    expect(fragment.querySelector('img[alt="dot"]')?.getAttribute('src')).toMatch(/^data:image/)
  })

  it('should mark each link with where it leads when the file links out, in and to a heading', () => {
    // Arrange
    const text =
      '[web](https://example.com) [file](../src/main.ts#L3) [here](#acme) [mail](mailto:a@b.c)'

    // Act
    const { fragment } = classify(sanitized(text), README)

    // Assert
    const links = [...fragment.querySelectorAll('a')]
    expect(links.map((link) => link.getAttribute('data-md-link'))).toEqual([
      'external',
      'file',
      'anchor',
      'none',
    ])
    expect(links[3]?.hasAttribute('href')).toBe(false)
  })

  it('should list the fenced code blocks with their language when the file has some', () => {
    const { codes } = classify(sanitized('```ts\nconst a = 1\n```\n\n```\nplain\n```'), README)

    expect(codes.map((code) => code.language)).toEqual(['ts'])
    expect(codes[0]?.element.textContent).toBe('const a = 1\n')
  })
})

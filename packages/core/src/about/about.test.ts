import { describe, expect, it } from 'vitest'
import { aboutUrl } from './about.ts'

describe('aboutUrl', () => {
  it.each([
    ['repository', 'https://github.com/acme/cockpit'],
    ['releaseNotes', 'https://github.com/acme/cockpit/releases/tag/v1.2.3'],
    ['issue', 'https://github.com/acme/cockpit/issues/new'],
    ['license', 'https://github.com/acme/cockpit/blob/main/LICENSE'],
  ] as const)('should point %s to its page when the version is 1.2.3', (link, url) => {
    expect(aboutUrl('acme/cockpit', '1.2.3', link)).toBe(url)
  })
})

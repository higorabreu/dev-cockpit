import { describe, expect, it } from 'vitest'
import { downloadAllowed, frameNavigation } from './frame-guard.ts'

const PDF = 'dck-file://open/0a1b2c3d-0000-4000-8000-000000000001'
const VIEWER = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html'
const PAGE = 'file:///opt/dev-cockpit/resources/app/index.html'

describe('frameNavigation', () => {
  it('should let a frame show an opened PDF and the viewer that draws it', () => {
    expect(frameNavigation(PDF, false, { initiator: PAGE, pdfShown: true })).toBe('allow')
    expect(frameNavigation(VIEWER, false, { initiator: PDF, pdfShown: true })).toBe('allow')
    expect(frameNavigation('about:blank', false, { initiator: PAGE, pdfShown: true })).toBe('allow')
  })

  it('should send a web link to the browser when the PDF asks the window to follow it', () => {
    expect(
      frameNavigation('https://example.com/spec#page=2', true, {
        initiator: VIEWER,
        pdfShown: true,
      }),
    ).toBe('external')
    expect(frameNavigation('http://example.com/', true, { initiator: PDF, pdfShown: true })).toBe(
      'external',
    )
  })

  it('should send a web link to the browser when the viewer asks from the browser side with a PDF shown', () => {
    const source = { initiator: undefined, pdfShown: true }

    expect(frameNavigation('https://example.com/spec', true, source)).toBe('external')
    expect(frameNavigation('file:///etc/passwd', true, source)).toBe('deny')
  })

  it('should send a web link to the browser when a frame of the PDF follows it', () => {
    expect(
      frameNavigation('https://example.com/spec', false, { initiator: VIEWER, pdfShown: true }),
    ).toBe('external')
  })

  it('should keep the window in place when the page itself or nobody asks it to leave', () => {
    expect(frameNavigation('https://example.com/', true, { initiator: PAGE, pdfShown: true })).toBe(
      'deny',
    )
    expect(
      frameNavigation('https://example.com/', true, { initiator: undefined, pdfShown: false }),
    ).toBe('deny')
    expect(frameNavigation(PDF, true, { initiator: VIEWER, pdfShown: true })).toBe('deny')
    expect(frameNavigation('file:///etc/passwd', true, { initiator: VIEWER, pdfShown: true })).toBe(
      'deny',
    )
  })

  it.each([
    'file:///etc/passwd',
    'javascript:alert(1)',
    'dck-file://evil.example.com/x',
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop/index.html',
    'data:text/html,<script>1</script>',
    'not a url',
  ])('should refuse %s when a frame tries to go there', (url) => {
    expect(frameNavigation(url, false, { initiator: VIEWER, pdfShown: true })).toBe('deny')
  })
})

describe('downloadAllowed', () => {
  it('should save only the file the viewer shows when its download button is pressed', () => {
    expect(downloadAllowed(PDF)).toBe(true)
    expect(downloadAllowed('https://example.com/a.zip')).toBe(false)
    expect(downloadAllowed('file:///home/ana/a.pdf')).toBe(false)
  })
})

// The non-text kinds the plan weighs: images, a Markdown preview and PDF through pdf.js. Each mounts into
// the file view's element and resolves once its first content is on screen.
export const afterPaint = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        channel.port1.close()
        resolve(performance.now())
      }
      channel.port2.postMessage(null)
    }),
  )

// `<img>` straight from the file, fitted to the view by CSS; Chromium keeps the decoded pixels
export async function showImage(parent, url) {
  const image = document.createElement('img')
  image.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block'
  image.decoding = 'async'
  image.src = url
  await image.decode()
  parent.append(image)
  await afterPaint()
  return { width: image.naturalWidth, height: image.naturalHeight }
}

// Decoded at most `cap` pixels on the long side, then shown from a bitmap; the full size never stays
export async function showImageCapped(parent, url, bytes, type, cap) {
  // An image that is never drawn is not decoded: its size comes from the header alone
  const header = new Image()
  header.src = url
  await new Promise((resolve, reject) => {
    header.onload = resolve
    header.onerror = reject
  })
  const width = header.naturalWidth
  const height = header.naturalHeight
  header.src = ''
  const blob = new Blob([bytes], { type })
  const scale = Math.min(1, cap / Math.max(width, height))
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: Math.round(width * scale),
    resizeHeight: Math.round(height * scale),
    resizeQuality: 'high',
  })
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block'
  canvas.getContext('bitmaprenderer').transferFromImageBitmap(bitmap)
  parent.append(canvas)
  await afterPaint()
  return { width, height, shown: [canvas.width, canvas.height] }
}

const previewCss =
  'height:100%;overflow:auto;padding:16px 32px;box-sizing:border-box;font-family:var(--font-sans);' +
  'color:var(--fg);background:var(--bg);line-height:1.5'

// No remote images or links that leave the app: a preview shows what is in the file
function sanitizer(purify) {
  purify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (
      data.attrName === 'src' &&
      /^[a-z]+:/i.test(data.attrValue) &&
      !/^data:/i.test(data.attrValue)
    )
      data.keepAttr = false
  })
  return (html) => purify.sanitize(html)
}

// lazy: each top-level block skips layout and paint until it nears the view (content-visibility)
export async function showMarkdown(parent, text, engine, lazy) {
  const started = performance.now()
  const { default: purify } = await import('dompurify')
  let render
  if (engine === 'markdown-it') {
    const { default: MarkdownIt } = await import('markdown-it')
    const md = new MarkdownIt({ html: true, linkify: true })
    render = (source) => md.render(source)
  } else {
    const { marked } = await import('marked')
    render = (source) => marked.parse(source, { async: false })
  }
  const clean = sanitizer(purify)
  const loaded = performance.now()
  const html = render(text)
  const parsed = performance.now()
  const safe = clean(html)
  const sanitized = performance.now()
  const preview = document.createElement('article')
  preview.style.cssText = previewCss
  preview.innerHTML = safe
  if (lazy) {
    for (const block of preview.children) {
      block.style.contentVisibility = 'auto'
      block.style.containIntrinsicSize = 'auto 40px'
    }
  }
  parent.append(preview)
  const painted = await afterPaint()
  return {
    load: loaded - started,
    parse: parsed - loaded,
    sanitize: sanitized - parsed,
    paint: painted - sanitized,
    nodes: preview.getElementsByTagName('*').length,
  }
}

// pdf.js with its worker. Only the pages near the view are drawn, and a page far from it gives its canvas
// back, as pdf.js's own viewer keeps a small buffer of pages
const KEEP_PAGES = 6

export async function showPdf(parent, bytes, workerUrl) {
  const started = performance.now()
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const loaded = performance.now()
  const task = pdfjs.getDocument({ data: bytes, useWasm: false })
  const document_ = await task.promise
  const opened = performance.now()
  const scroller = document.createElement('div')
  scroller.style.cssText = 'height:100%;overflow:auto;background:var(--surface)'
  parent.append(scroller)
  const width = Math.min(900, parent.clientWidth - 32)
  const pages = []
  for (let number = 1; number <= document_.numPages; number++) {
    const page = await document_.getPage(number)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: (width / base.width) * devicePixelRatio })
    const canvas = document.createElement('canvas')
    canvas.width = 0
    canvas.height = 0
    canvas.style.cssText = `display:block;margin:16px auto;width:${width}px;height:${
      (viewport.height / viewport.width) * width
    }px;background:white`
    scroller.append(canvas)
    pages.push({ page, viewport, canvas, drawn: false })
  }
  const drawn = []
  const draw = async (entry) => {
    if (entry.drawn) return
    entry.drawn = true
    drawn.push(entry)
    entry.canvas.width = entry.viewport.width
    entry.canvas.height = entry.viewport.height
    await entry.page.render({ canvas: entry.canvas, viewport: entry.viewport }).promise
    while (drawn.length > KEEP_PAGES) {
      const old = drawn.shift()
      old.drawn = false
      old.canvas.width = 0
      old.canvas.height = 0
      old.page.cleanup()
    }
  }
  // The pages in view (and the next one)
  const visible = () =>
    pages.filter((entry) => {
      const top = entry.canvas.offsetTop - scroller.scrollTop
      return top < scroller.clientHeight * 2 && top + entry.canvas.offsetHeight > 0
    })
  for (const entry of visible()) await draw(entry)
  const painted = await afterPaint()
  return {
    load: loaded - started,
    open: opened - loaded,
    firstPages: painted - opened,
    pages: document_.numPages,
    // Down to the last page a screen at a time, drawing what comes into view
    scrollThrough: async () => {
      while (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1) {
        scroller.scrollTop += scroller.clientHeight
        for (const entry of visible()) await draw(entry)
        await afterPaint()
      }
      return drawn.length
    },
    destroy: () => task.destroy(),
  }
}

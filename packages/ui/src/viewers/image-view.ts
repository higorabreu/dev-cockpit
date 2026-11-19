import { FILE_LIMITS } from '@dck/core'
import { h, icon } from '../panel/dom.ts'
import {
  canPan,
  clampPlacement,
  decodeSize,
  fitPlacement,
  type Placement,
  type Size,
  stepScale,
  zoomAt,
} from './image-fit.ts'

// What the header's zoom controls say, from the catalogs
export interface ImageTexts {
  readonly zoomIn: string
  readonly zoomOut: string
  readonly fit: string
  readonly actual: string
  readonly image: string
}

export type ZoomStep = 1 | -1 | 'fit' | 'actual'

export interface ImageView {
  readonly element: HTMLElement
  // The zoom controls for the file's header
  readonly tools: HTMLElement
  readonly size: Size
  zoom(step: ZoomStep): void
  focus(): void
  destroy(): void
}

export type ImageLoad =
  | { readonly kind: 'shown'; readonly view: ImageView }
  | { readonly kind: 'too-large'; readonly size: Size }
  | { readonly kind: 'failed' }

export interface ImageOptions {
  readonly parent: HTMLElement
  readonly url: string
  // An SVG: drawn at the bitmap's full side, since it has no pixels of its own
  readonly vector: boolean
  readonly texts: ImageTexts
  // A bitmap image's bytes and media type, decoded straight to the size it shows; an SVG is drawn from
  // its `<img>`
  bytes?(): Promise<Uint8Array<ArrayBuffer> | undefined>
  readonly type?: string
}

// An SVG without a width and a height has no size of its own; Chromium draws such an image at 300x150
const VECTOR_FALLBACK: Size = { width: 300, height: 150 }
// One arrow key moves the image this far, as a scroll step
const PAN_STEP = 48
// A wheel notch with Ctrl zooms by this factor
const WHEEL_ZOOM = 1.1

const ICONS = {
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
} as const

// The image's size from its header: an `<img>` that is never drawn is not decoded
function readSize(url: string): Promise<{ image: HTMLImageElement; size: Size } | undefined> {
  const image = new Image()
  image.decoding = 'async'
  return new Promise((resolve) => {
    image.onload = () =>
      resolve({ image, size: { width: image.naturalWidth, height: image.naturalHeight } })
    image.onerror = () => resolve(undefined)
    image.src = url
  })
}

// The bitmap the view draws: from the bytes for a bitmap image (a decode through an `<img>` stays in
// Chromium's memory once the image is gone, F0), from the `<img>` for an SVG, which only it can rasterize
async function decode(
  options: ImageOptions,
  image: HTMLImageElement,
  size: Size,
): Promise<ImageBitmap | undefined> {
  const { width, height } = decodeSize(size, FILE_LIMITS.imageSide, options.vector)
  const resize = { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' } as const
  if (options.vector || !options.bytes)
    return createImageBitmap(image, resize).catch(() => undefined)
  const bytes = await options.bytes()
  if (!bytes) return undefined
  const type = options.type ?? ''
  // WebCodecs decodes the first frame from the bytes in place, at a smaller scale where the format
  // allows; a Blob would copy the whole file into another process first
  if (await ImageDecoder.isTypeSupported(type).catch(() => false)) {
    const decoder = new ImageDecoder({
      data: bytes,
      type,
      desiredWidth: width,
      desiredHeight: height,
    })
    const decoded = await decoder.decode({ frameIndex: 0 }).catch(() => undefined)
    const bitmap =
      decoded && (await createImageBitmap(decoded.image, resize).catch(() => undefined))
    decoded?.image.close()
    decoder.close()
    return bitmap
  }
  return createImageBitmap(new Blob([bytes]), resize).catch(() => undefined)
}

// An image over the tab, decoded once into a bitmap at most FILE_LIMITS.imageSide pixels on its long
// side and drawn on a canvas the size of the view: a plain `<img>` keeps the whole decoded image, and
// Chromium keeps it after the element is gone (F0). The bitmap is closed when the view goes
export async function showImage(options: ImageOptions): Promise<ImageLoad> {
  const read = await readSize(options.url)
  if (!read) return { kind: 'failed' }
  const { image } = read
  const vector = options.vector
  const size =
    vector && (read.size.width === 0 || read.size.height === 0) ? VECTOR_FALLBACK : read.size
  if (size.width * size.height > FILE_LIMITS.imagePixels) {
    image.src = ''
    return { kind: 'too-large', size }
  }
  if (!vector) image.src = ''
  const bitmap = await decode(options, image, size)
  image.src = ''
  if (!bitmap) return { kind: 'failed' }
  return { kind: 'shown', view: mountImage(options, bitmap, size) }
}

function mountImage(options: ImageOptions, bitmap: ImageBitmap, size: Size): ImageView {
  const { texts } = options
  const canvas = h('canvas', { class: 'iv-canvas', 'aria-hidden': 'true' })
  const backdrop = h('div', { class: 'iv-backdrop' })
  const element = h(
    'div',
    { class: 'image-view', tabindex: '0', role: 'img', 'aria-label': texts.image },
    backdrop,
    canvas,
  )
  options.parent.replaceChildren(element)
  const context = canvas.getContext('2d')
  let view: Size = { width: 1, height: 1 }
  let placement: Placement = { scale: 1, x: 0, y: 0 }
  let fitted = true

  const button = (label: string, content: Node | string, extra: Record<string, string>) =>
    h(
      'button',
      { type: 'button', class: 'fv-zoom', 'aria-label': label, 'data-tip': label, ...extra },
      content,
    )
  const zoomOut = button(texts.zoomOut, icon(ICONS.minus, 14), {
    'data-tip-shortcut': 'fontSmaller',
  })
  const zoomIn = button(texts.zoomIn, icon(ICONS.plus, 14), { 'data-tip-shortcut': 'fontBigger' })
  const fit = button(texts.fit, texts.fit, { 'data-tip-shortcut': 'fontReset' })
  const actual = button(texts.actual, texts.actual, { 'data-tip-key': '1' })
  const percent = h('span', { class: 'fv-zoom-level', role: 'status' })
  const tools = h('span', { class: 'fv-tools' }, zoomOut, percent, zoomIn, fit, actual)

  function draw() {
    const ratio = window.devicePixelRatio || 1
    if (!context) return
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    const width = size.width * placement.scale
    const height = size.height * placement.scale
    // Pixel art read at a large zoom keeps its square pixels; a photo shrunk or grown a little is smoothed
    context.imageSmoothingEnabled = options.vector || width / bitmap.width < 2
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      bitmap,
      placement.x * ratio,
      placement.y * ratio,
      width * ratio,
      height * ratio,
    )
    Object.assign(backdrop.style, {
      left: `${placement.x}px`,
      top: `${placement.y}px`,
      width: `${width}px`,
      height: `${height}px`,
    })
    percent.textContent = `${Math.round(placement.scale * 100)}%`
    fit.setAttribute('aria-pressed', String(fitted))
    actual.setAttribute('aria-pressed', String(!fitted && Math.abs(placement.scale - 1) < 1e-6))
    element.toggleAttribute('data-pan', canPan(placement, size, view))
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1
    view = { width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) }
    canvas.width = Math.round(view.width * ratio)
    canvas.height = Math.round(view.height * ratio)
    placement = fitted ? fitPlacement(size, view) : clampPlacement(placement, size, view)
    draw()
  }

  const center = () => ({ x: view.width / 2, y: view.height / 2 })

  function zoom(step: ZoomStep, point = center()) {
    if (step === 'fit') {
      fitted = true
      placement = fitPlacement(size, view)
    } else {
      fitted = false
      const scale = step === 'actual' ? 1 : stepScale(placement.scale, step)
      placement = zoomAt(placement, scale, point, size, view)
    }
    draw()
  }

  function pan(dx: number, dy: number) {
    placement = clampPlacement(
      { ...placement, x: placement.x + dx, y: placement.y + dy },
      size,
      view,
    )
    draw()
  }

  zoomOut.addEventListener('click', () => zoom(-1))
  zoomIn.addEventListener('click', () => zoom(1))
  fit.addEventListener('click', () => zoom('fit'))
  actual.addEventListener('click', () => zoom('actual'))

  // Drag to pan, only when the image is larger than the view
  let drag: { x: number; y: number } | undefined
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !canPan(placement, size, view)) return
    drag = { x: event.clientX, y: event.clientY }
    element.setPointerCapture(event.pointerId)
    element.setAttribute('data-dragging', '')
  })
  element.addEventListener('pointermove', (event) => {
    if (!drag) return
    pan(event.clientX - drag.x, event.clientY - drag.y)
    drag = { x: event.clientX, y: event.clientY }
  })
  const endDrag = () => {
    drag = undefined
    element.removeAttribute('data-dragging')
  }
  element.addEventListener('pointerup', endDrag)
  element.addEventListener('pointercancel', endDrag)
  element.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const box = element.getBoundingClientRect()
        const factor = event.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM
        fitted = false
        placement = zoomAt(
          placement,
          placement.scale * factor,
          { x: event.clientX - box.left, y: event.clientY - box.top },
          size,
          view,
        )
        draw()
        return
      }
      if (!canPan(placement, size, view)) return
      event.preventDefault()
      pan(-event.deltaX, -event.deltaY)
    },
    { passive: false },
  )
  // The image's own keys, without a modifier, as image viewers have them; Ctrl with + − 0 come through
  // the app's font keys (file-tabs.ts)
  const KEYS: Readonly<Record<string, () => void>> = {
    '+': () => zoom(1),
    '=': () => zoom(1),
    '-': () => zoom(-1),
    '0': () => zoom('fit'),
    '1': () => zoom('actual'),
    ArrowLeft: () => pan(PAN_STEP, 0),
    ArrowRight: () => pan(-PAN_STEP, 0),
    ArrowUp: () => pan(0, PAN_STEP),
    ArrowDown: () => pan(0, -PAN_STEP),
  }
  element.addEventListener('keydown', (event) => {
    const run = event.ctrlKey || event.metaKey || event.altKey ? undefined : KEYS[event.key]
    if (!run) return
    event.preventDefault()
    run()
  })

  const observer = new ResizeObserver(resize)
  observer.observe(element)
  resize()

  return {
    element,
    tools,
    size,
    zoom,
    focus: () => element.focus({ preventScroll: true }),
    destroy() {
      observer.disconnect()
      bitmap.close()
      // A canvas holds its pixels until it is resized or collected
      canvas.width = 0
      canvas.height = 0
      element.remove()
    },
  }
}

export interface Size {
  readonly width: number
  readonly height: number
}

// Where the image sits in the view, in CSS pixels: its top left corner and its scale against its own size
export interface Placement {
  readonly scale: number
  readonly x: number
  readonly y: number
}

// The steps + and − go through, as an image viewer's; fit sits between two of them
const STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8] as const
export const MIN_SCALE = 0.1
export const MAX_SCALE = 8

// The bitmap the view draws from: at most `side` pixels on the long side, never larger than the image (an
// SVG has no pixels of its own and is drawn at the full side)
export function decodeSize(image: Size, side: number, vector: boolean): Size {
  const long = Math.max(image.width, image.height, 1)
  const scale = vector ? side / long : Math.min(1, side / long)
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  }
}

// The whole image in the view; a small image stays at its own size rather than grow blurred
export const fitScale = (image: Size, view: Size): number =>
  Math.min(1, view.width / Math.max(1, image.width), view.height / Math.max(1, image.height))

// The next step up or down from the current scale, within the limits; fit counts as any scale
export function stepScale(scale: number, direction: 1 | -1): number {
  if (direction > 0) return STEPS.find((step) => step > scale + 1e-6) ?? MAX_SCALE
  return [...STEPS].reverse().find((step) => step < scale - 1e-6) ?? Math.min(scale, MIN_SCALE)
}

// Along one axis: centered while the image is smaller than the view, else kept from leaving a gap
function clampAxis(offset: number, shown: number, view: number): number {
  if (shown <= view) return (view - shown) / 2
  return Math.min(0, Math.max(view - shown, offset))
}

export function clampPlacement(placement: Placement, image: Size, view: Size): Placement {
  const { scale } = placement
  return {
    scale,
    x: clampAxis(placement.x, image.width * scale, view.width),
    y: clampAxis(placement.y, image.height * scale, view.height),
  }
}

// The image at its fit scale, centered
export function fitPlacement(image: Size, view: Size): Placement {
  return clampPlacement({ scale: fitScale(image, view), x: 0, y: 0 }, image, view)
}

// A new scale that keeps the image's point under `point` (a pointer, or the view's center) where it is
export function zoomAt(
  placement: Placement,
  scale: number,
  point: { readonly x: number; readonly y: number },
  image: Size,
  view: Size,
): Placement {
  const next = Math.min(MAX_SCALE, Math.max(Math.min(MIN_SCALE, placement.scale), scale))
  const ratio = next / placement.scale
  return clampPlacement(
    {
      scale: next,
      x: point.x - (point.x - placement.x) * ratio,
      y: point.y - (point.y - placement.y) * ratio,
    },
    image,
    view,
  )
}

// Whether the image is larger than the view on either axis, so a drag pans it
export const canPan = (placement: Placement, image: Size, view: Size): boolean =>
  image.width * placement.scale > view.width + 0.5 ||
  image.height * placement.scale > view.height + 0.5

# Terminal rendering cost

Not started; noted by the maintainer on 2026-11-17 for later.

## Goal

Lower what the cockpit spends to draw a terminal whose TUI updates all the time. Today, with a tab running an
idle Claude Code (about 10 writes a second), the renderer and the GPU process take about 14% of one core.
The cause is xterm's DOM renderer in a transparent window: each update touches the page, recalculates the
layout and composites the window again.

Baseline, as one core: renderer about 6%, GPU process about 4%, main about 1.3%.

## Candidates

- **WebGL renderer.** Load `@xterm/addon-webgl` in `ui/src/terminal/terminal-session.ts` and fall back to
  the DOM renderer on `onContextLoss`. It promises the largest gain, but it runs into two decisions:
  - D14 chose the DOM renderer because WebGL and canvas drew the wrong font in this environment. That has
    to be checked again with xterm 6 and the bundled fonts.
  - D50 turned hardware acceleration off on Linux. Without it WebGL runs on SwiftShader (GL in software)
    and may cost more CPU than the DOM, not less. So WebGL only pays with the GPU back on: measure it
    together with the GPU switch (`DCK_GPU=1`, deferred with D50) and the idle memory budget.
- **Cursor.** Turn `cursorBlink` off while the window is hidden or the terminal has no focus.
- **Hidden window.** Confirm that `backgroundThrottling` holds under native Wayland after `hide()`: no frames
  and no `requestAnimationFrame` while the window is put away.
- **Transparency.** Measure what `allowTransparency` (xterm) and `transparent: true` (the window) cost when
  the configured opacity is 1, and turn them off in that case.

## How to measure

- CPU per thread (the renderer's main thread, `VizCompositorThread` and `Compositor`) over 10 s, with one
  tab running an idle Claude Code.
- With the window shown and hidden, before and after each change, on the maintainer's machine, since a
  real GPU is needed for the GPU cases.
- Idle memory (shell plus daemon) next to the CPU, since the 300 MB budget is what D50 protected.

## Acceptance criteria (draft)

| Id | Criterion |
| --- | --- |
| TR1 | The CPU of an idle Claude Code tab, window shown, drops clearly below the 14% baseline |
| TR2 | With the window hidden, the cockpit draws no frames |
| TR3 | Idle memory stays under the 300 MB budget |
| TR4 | The font and the transparency look the same as today, in both themes |

# Terminal rendering cost

Noted by the maintainer on 2026-11-17. The cheap candidates (cursor, hidden window, transparency) were
measured the same day: see Results. WebGL is still open.

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
| TR3 | Idle memory stays under the idle budget (350 MB since D90) |
| TR4 | The font and the transparency look the same as today, in both themes |

## Results (2026-11-17, the cheap candidates)

**How.** Electron 45.3.0 under Xvfb (1400x760x24) with no GPU and hardware acceleration off (D50), so the
numbers are relative: the maintainer measures again on his machine. CPU is the share of one core from
`utime+stime` in `/proc/<pid>/task/<tid>/stat` over 10 s, with the window shown and then hidden by
`dck toggle` (3 s to settle), median of 3 launches. Renderer is the process total (its main thread /
`Compositor`), GPU the process total (`VizCompositorThread`), main the main process; the total adds every
process of the app. Frames are the `requestAnimationFrame` count in 2 s at the end of the hidden phase,
one per launch, taken by a page script through `DCK_EVAL`. Workloads, one tab each: **TUI** is a node script
that redraws a four line status block (spinner, counter, footer) with cursor moves 10 times a second and
the terminal cursor hidden, as Claude Code's Ink does; **TUI, cursor shown** is the same with the cursor
visible; **idle prompt** is bash waiting at its prompt. Other sessions shared the machine: differences under
about 0.5 are noise. Playwright was set aside for the numbers: its DevTools session emulates focus and kept
`document.visibilityState` at `visible` after `hide()`, so a window it drives never looks hidden.

Xvfb alone (X11, no compositing manager):

| Build | Workload | Opacity | Window | Renderer (main / Compositor) | GPU (Viz) | Main | Daemon | Total | Frames |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | TUI | 0.92 | shown | 3.1 (1.8 / 0.8) | 1.1 (0.9) | 0.5 | 0.0 | 4.7 |  |
| before | TUI | 0.92 | hidden | 0.7 (0.6 / 0.0) | 0.0 (0.0) | 1.0 | 0.2 | 1.7 | 0/0/0 |
| before | TUI | 1 | shown | 3.2 (1.8 / 0.9) | 1.0 (0.8) | 0.6 | 0.0 | 4.8 |  |
| before | TUI | 1 | hidden | 0.7 (0.5 / 0.0) | 0.0 (0.0) | 0.9 | 0.3 | 1.8 | 0/0/0 |
| after | TUI | 0.92 | shown | 3.3 (1.7 / 0.9) | 1.1 (0.9) | 0.5 | 0.0 | 5.0 |  |
| after | TUI | 0.92 | hidden | 0.6 (0.5 / 0.0) | 0.0 (0.0) | 0.8 | 0.1 | 1.6 | 0/0/0 |
| before | TUI, cursor shown | 0.92 | shown | 4.2 (2.8 / 1.1) | 1.2 (1.0) | 0.4 | 0.0 | 5.7 |  |
| before | TUI, cursor shown | 0.92 | hidden | 0.7 (0.6 / 0.0) | 0.0 (0.0) | 1.0 | 0.1 | 1.8 | 0/0/0 |
| before | TUI, cursor shown | 1 | shown | 4.7 (2.9 / 1.3) | 1.2 (1.0) | 0.4 | 0.0 | 6.2 |  |
| before | TUI, cursor shown | 1 | hidden | 0.8 (0.7 / 0.0) | 0.0 (0.0) | 0.8 | 0.2 | 1.8 | 0/0/0 |
| after | TUI, cursor shown | 0.92 | shown | 3.4 (1.9 / 1.0) | 1.1 (0.9) | 0.5 | 0.0 | 5.0 |  |
| after | TUI, cursor shown | 0.92 | hidden | 0.6 (0.5 / 0.0) | 0.0 (0.0) | 0.9 | 0.2 | 1.6 | 0/0/0 |
| no blink at all | TUI, cursor shown | 0.92 | shown | 3.4 (1.9 / 0.9) | 1.1 (0.9) | 0.5 | 0.0 | 5.0 |  |
| before | idle prompt | 0.92 | shown | 2.3 (1.4 / 0.8) | 1.0 (0.8) | 0.1 | 0.0 | 3.4 |  |
| before | idle prompt | 0.92 | hidden | 0.3 (0.2 / 0.0) | 0.0 (0.0) | 0.5 | 0.1 | 0.9 | 0/0/0 |
| before | idle prompt | 1 | shown | 2.1 (1.2 / 0.7) | 0.7 (0.6) | 0.1 | 0.0 | 2.9 |  |
| before | idle prompt | 1 | hidden | 0.4 (0.3 / 0.0) | 0.0 (0.0) | 0.5 | 0.2 | 1.0 | 0/0/0 |
| after | idle prompt | 0.92 | shown | 0.4 (0.3 / 0.2) | 0.2 (0.2) | 0.1 | 0.0 | 0.7 |  |
| after | idle prompt | 0.92 | hidden | 0.2 (0.2 / 0.0) | 0.0 (0.0) | 0.2 | 0.1 | 0.6 | 0/0/0 |
| no blink at all | idle prompt | 0.92 | shown | 0.2 (0.1 / 0.1) | 0.2 (0.1) | 0.1 | 0.0 | 0.5 |  |
| opaque window | TUI | 1 | shown | 3.2 (1.7 / 1.0) | 1.0 (0.8) | 0.6 | 0.0 | 4.7 |  |
| opaque window | idle prompt | 1 | shown | 2.2 (1.2 / 0.8) | 1.0 (0.7) | 0.1 | 0.0 | 3.2 |  |

With mutter 46 as the X11 compositing window manager (as GNOME on X11), mutter's own CPU in the last column:

| Build | Workload | Opacity | Window | Renderer (main / Compositor) | GPU (Viz) | Main | Daemon | Total | Mutter |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | TUI | 0.92 | shown | 3.0 (1.7 / 0.9) | 1.1 (0.9) | 0.5 | 0.0 | 4.6 | 2.1 |
| before | TUI | 1 | shown | 3.2 (1.7 / 0.9) | 1.1 (0.9) | 0.5 | 0.0 | 4.8 | 1.9 |
| opaque window | TUI | 1 | shown | 3.1 (1.7 / 0.9) | 2.7 (2.5) | 0.4 | 0.0 | 6.2 | 1.5 |

Native Wayland (mutter 46 headless, the app with `--ozone-platform=wayland`, mutter in the last column):

| Build | Workload | Opacity | Window | Renderer (main / Compositor) | GPU (Viz) | Main | Daemon | Total | Mutter | Frames |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| before | TUI | 0.92 | shown | 2.3 (1.3 / 0.7) | 1.0 (0.7) | 0.6 | 0.0 | 3.9 | 1.5 |  |
| before | TUI | 0.92 | hidden | 0.6 (0.5 / 0.0) | 0.0 (0.0) | 0.8 | 0.2 | 1.7 | 0.0 | 0/0/0 |
| before | idle prompt | 0.92 | shown | 1.7 (1.0 / 0.7) | 0.8 (0.5) | 0.1 | 0.0 | 2.6 | 0.2 |  |
| before | idle prompt | 0.92 | hidden | 0.3 (0.2 / 0.0) | 0.0 (0.0) | 0.4 | 0.1 | 0.9 | 0.0 | 0/0/0 |
| after | idle prompt | 0.92 | shown | 0.4 (0.2 / 0.1) | 0.2 (0.1) | 0.1 | 0.0 | 0.6 | 0.1 |  |
| after | idle prompt | 0.92 | hidden | 0.3 (0.2 / 0.0) | 0.0 (0.0) | 0.5 | 0.1 | 0.9 | 0.0 | 0/0/0 |

**Cursor: kept, changed (D58).** xterm 6's DOM renderer already blinks only while its input has the focus
and the window has it too, so turning `cursorBlink` off while hidden or unfocused would change nothing: no
hidden run had a blinking cell. The cost was the blink itself while focused: an infinite CSS animation that
Chromium runs every frame, about 2.9 points of a core at an idle prompt (3.4 against 0.5 with no blink).
The session now turns that animation off and blinks the same cursor with a timer, 500 ms shown and 500 ms
hidden, only while the terminal has the focus and the page is visible (`ui/src/terminal/cursor-blink.ts`).
The idle prompt drops to 0.7 (X11) and 0.6 (Wayland), and a TUI that shows its cursor to what it costs with
no blink at all. A TUI that hides its cursor, like Claude Code, does not change.

**Hidden window: nothing to fix.** On X11 and on native Wayland, `hide()` turns the page hidden
(`visibilitychange` fires), no frame is drawn and the GPU process and the renderer's compositor go to zero;
`backgroundThrottling` stays at its default (on). What still runs hidden, about 1.7 points, is xterm parsing
the output and the main process carrying it and the session watch, which keeps running on purpose for the
notifications. The review's watch and the panel pause on `document.hidden`, which does change.

**Transparency: dropped.** xterm's `allowTransparency` is read only by the canvas and WebGL renderers, so
the DOM renderer ignores it. Opacity 1 against 0.92 costs the same. A window created opaque at opacity 1
saved nothing on bare Xvfb and, with a compositing manager, cost more: the GPU process went from 1.1 to 2.7
while mutter went from 1.9 to 1.5. It would also have needed a restart whenever the opacity crossed 1, since
`transparent` is fixed when the window is created.

**Criteria.** TR1: an idle prompt drops from 3.4 to 0.7 here; a TUI with its cursor hidden stays at about
5, so the 14% of an idle Claude Code needs the WebGL candidate unless Claude Code shows the terminal cursor
on that machine. TR2: met on X11 and on native Wayland. TR3: no process and no memory added. TR4: the blink
keeps xterm's period and hidden phase; transparency is untouched.

**For the maintainer to check on his machine.** The same three cases (TUI with the cursor hidden and shown,
idle prompt) on GNOME under Wayland, with `top -H -p <pid>` on the renderer and the GPU process. That the
window draws nothing when hidden, with this file as `DCK_EVAL` and the window hidden (F9 or
`pnpm dev:dck toggle`) within 8 seconds of showing:
`DCK_EVAL=/tmp/hidden.js DCK_EVAL_TIMEOUT_MS=30000 pnpm dev`, then the log line `eval result` should read
`hidden` and 0 frames:

```js
new Promise((resolve) => setTimeout(() => {
  let frames = 0
  const tick = () => { frames += 1; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  setTimeout(() => { window.__out = { state: document.visibilityState, frames }; resolve() }, 2000)
}, 10000))
```

And the cursor by eye, in both themes: it blinks at the same pace, stays solid while typing, and a program
that asks for a steady or a bar cursor (`printf '\e[2 q'`, `printf '\e[5 q'`) still gets it.

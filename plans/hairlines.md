# Hairlines and the side by side headers

**Status:** Done (D85).

Reported by the maintainer on 2026-11-19 (Ubuntu, GNOME, fractional scale, a drop-down anchored at the
top): the 1px lines are not all the same thickness and change with the window's height, and the panel's
header and the file view's header have different heights, so their dividers and their text do not meet.

## Measured

The real app on Xvfb, Electron with `--force-device-scale-factor` 1, 1.25, 1.5 and 2, dark theme, the
panel open with every section, full height and anchored at 0.37, 0.5 and 0.63 of a 1080 work area plus
401 and 557 DIPs, next to the terminal, the review (side by side) and the file view, and the hold menu.
Each line's thickness is read from the screenshot: per device row across it, how far the pixel moved from
the background toward the line color (1 is a full line pixel), the median of 15 samples along it.

Thickness in device pixels (rows it covers), every height and scene:

| Line | Scale | Before | After |
| --- | --- | --- | --- |
| Tab bar, file header, review header, panel sections, panel and rail left edges | 1, 1.25, 1.5 | 1.00 (1) | 1.00 (1) |
| Same | 2 | 2.00 (2) | 2.00 (2) |
| Panel header | all | none of its own (the first section's line, 1 row) | 1.00 (1), 2.00 (2) at 2 |
| Pane divider | 1, 1.25 | 1.00 (1) | 1.00 (1) |
| Pane divider | 1.5 | **2.00 (2)** | 1.00 (1) |
| Pane divider | 2 | 2.00 (2) | 2.00 (2) |
| Hold menu hint, top and bottom | all | 1 row (2 at 2) | 1 row (2 at 2) |
| Hold menu hint, side | 1 | **0.50 over 2 columns** | 0.81 in 1 column |
| Hold menu hint, side | 1.25 | **0.73 over 2 columns** | 0.81 in 1 column |
| Hold menu hint, side | 1.5 | **0.50 in 1 column** | 0.81 in 1 column |
| Hold menu hint, side | 2 | **1.80 over 3 columns** | 1.75 in 2 columns |

Chromium snaps a border to whole device pixels wherever the box lands, so every border measured crisp in
its own output even at fractional positions (the bar at 41.9 CSS px at 1.25, a section line at 254.35).
What did not: the pane divider, a 1px box with a background (1.5 device pixels at 150%, drawn as 2), and
the hold menu hint, centered with `translateX(-50%)` and so moved by a fraction of a pixel. (The hint's
side reads 0.81 rather than 1 because it sits between the scrim and the hint's own surface.)

The window: an anchored or dragged height in DIPs is often not whole device pixels (557 DIPs at 125% is
696.25). The client draws 697 rows and a compositor that fits them into the window's box stretches them:
emulated on the before screenshot at 557 DIPs, the lines near the top stay on one row and the ones below
spread over two, the tab bar's at the bottom worst (0.69 and 0.31), the reported "thicker near the tab
bar". After, the dock controller asks 556 DIPs (695 pixels), which needs no stretch. (Under X11 Electron
itself moves such a window to 558 DIPs, so the stretch is emulated, not seen, on Xvfb.)

The headers, side by side at full height and at 0.37:

| Scale | Before: file / review / panel header height (CSS px) | Before: dividers (device row) | After |
| --- | --- | --- | --- |
| 1 | 31 / 40.5 / 33 | file 73, review 82, panel 76 | all 36, all on row 79 |
| 1.25 | 30.8 / 39.9 / 33.2 | 90, 101, 94 | all 36, row 99 |
| 1.5 | 30.67 / 39.5 / 33.33 | 107, 121, 112 | all 36, row 119 |
| 2 | 31 / 40.5 / 33 | 145, 164, 151 | all 36, rows 158 and 159 |

The panel's path baseline sat 3 to 5 device pixels off the file view's; after, within 0.11 to 0.42 of a
device pixel at every scale (both trimmed to their x-height and centered). Read from the glyphs, the last
dense row of the two paths is the same device row at 1, 1.25 and 1.5 and one row apart at 2, where Inter's
round letters overshoot. The panel's path keeps JetBrains Mono 11.5px (x-height 6.47px) and the file
view's keeps Inter 12px (6.56px), so their x-heights already matched.

## Tasks

- [x] T1. Tokens `size.hairline` (1), `size.bar` (44) and `size.header` (36), whole device pixels at the
  usual scales; a design test.
- [x] T2. Every 1px line in the line color is a border of `--size-hairline`; the pane divider and the file
  tab's divider become borders; the hold menu hint is centered by its margins.
- [x] T3. The tab bar takes `--size-bar`; the panel header, the file view header and the review header take
  `--size-header`, divider inside; the panel header draws its own divider; the two paths share a baseline.
- [x] T4. The dock controller snaps an anchored or dragged height to whole device pixels of the display;
  the Wayland screen keeps the monitor's scale. Tests.
- [x] T5. `styles/hairlines.test.ts`; decision D85; screenshots in the real app at 1.25, 1.5 and 2, both
  themes, full height and two anchored heights.

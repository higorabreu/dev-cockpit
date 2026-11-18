# Resize the window by dragging its bottom edge

People asked to change the cockpit's height with the mouse, as in Guake or Yakuake, instead of only with the
slider in the settings (2026-11-18).

Decided with the maintainer:

- The bottom edge of the window is the handle: a strip a few pixels high with no visible grip, the resize
  cursor and a thin line on hover. The window follows the pointer, its top stays; a small label shows the
  height in percent, the unit of the setting.
- On release the height is saved as `window.heightRatio` (one write), so the next opening keeps it and the
  slider follows. Limits 30% to 100%, a light snap at 50% and 100%, Esc while dragging goes back.
- At full height (F11) a drag leaves full height and sets the docked height where it is released.
- A double click on the edge toggles full height.
- While dragging the terminals keep their grid and refit when the pointer pauses and on release, so a shell
  or a TUI does not redraw on every frame.
- With the height locked by `DCK_HEIGHT` the edge does nothing.

## Tasks

- [x] R1. Core: `dragRatio` (clamp, snap, round) and the dock controller's live resize and its end
  (commit or cancel, leaving full height), with tests.
- [x] R2. Host API: `window.resize(height)` returning the ratio and `window.endResize(commit)`; the bridge
  validates with zod; the shell saves the ratio, refuses while locked and tells the window it left full
  height.
- [x] R3. Window: the edge, the label, Esc, the double click, the terminals' deferred fit. No tooltip on the
  edge: it covered the tab names whenever the pointer brushed the edge.
- [x] R4. Decision D67, README, a check in the real app (docked and full height, both themes).

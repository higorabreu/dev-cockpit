# Full height by dragging the edge to 100%

**Status:** Planned, after the maintenance of 0.11.1.

Today a drag of the bottom edge to 100% saves `window.heightRatio = 1` (D67). F11 then switches to full
height, which at 100% looks the same, so nothing happens, and there is no height left to go back to. Reported
by the maintainer (2026-11-18).

Decided with the maintainer:

- A drag released at 100% enters full height, as F11 does, and does not save 100% as the anchored height: the
  saved height stays the one from before the drag.
- F11 (or a double click on the edge) then leaves full height and goes back to that saved height. When the
  saved height is itself 100%, set in the settings, it goes back to 50%.
- A drag that starts at full height leaves it at once, as today, and sets the anchored height where it is
  released, unless that is 100% again.
- Below 100% nothing changes: the drag saves the height where it is released.

## Tasks

- [ ] F1. Core: `endResize` reports a release at 100% as full height (no ratio to save), the controller turns
  full height on, and leaving full height with an anchored height of 100% falls back to 50%. Tests.
- [ ] F2. Shell: on a release at full height, skip the save and tell the window it is at full height.
- [ ] F3. Decision (amends D67), README if it mentions the drag, a check in the real app with screenshots:
  drag to 100%, F11, drag up from full height, double click, both themes.

# Performance

The budgets of [AGENTS.md](../AGENTS.md) and of the file view ([files.md](files.md), "Budgets of its own"),
measured with `scripts/perf/` ([README](../scripts/perf/README.md)); rerun it on any build to compare. Two
rounds so far, both on 2026-11-19 on the same machine: the [baseline](#baseline-v020-to-v0110) of five
builds before the file editor, then [the file editor](#the-file-editor-f6) (F6), v0.12.0 against `main`
with the editor. Compare numbers within a round; across rounds only roughly.

## The file editor (F6)

### How

- **Builds**, each from source in its own `git worktree` with `pnpm install --frozen-lockfile` and
  `pnpm build`: v0.12.0 (`f6aeca8`, the last release without the file editor) and `main` (`6b8efa0`:
  v0.12.0 plus the file store #113, the file search #115, the editor #116, file paths #118, the viewers
  #119, the fixes to #124 and the CLI's lazy load #112). Both ask for Electron `^45.3.0` and ran on the same
  45.3.0 binary.
- **Machine**: the baseline's container (4 cores, 16 GB, no GPU, shared with other agent sessions), Xvfb
  1400x760x24 without a window manager or compositor, so a frame ends when Chromium commits it. Load
  average 0.0 to 0.4. Another session worked during part of the first run: the rest of the machine used up
  to 17 points of a core during v0.12.0's CPU samples, and one v0.12.0 launch drew its first prompt at 829
  ms. Absolute numbers belong to this machine; the maintainer's Ubuntu (GNOME Wayland, real display) adds
  up to a refresh interval to each latency.
- **Runs**: `measure.cjs`, 3 launches per build and phase, twice: every phase, then probe and size again
  once the script bundled the CLI as the `.deb` does since #112 (two builds, `dck.mjs` with only what
  `toggle` loads; the first run bundled one file, which no longer ships, and read 104 ms for `main`). The
  latency, cold start and size rows below come from the second run, memory, CPU and the list from the
  first; what both measured agrees within the noise (terminal echo 4.3 and 4.4 ms median in the first, 4.0
  and 4.1 in the second). `viewers.cjs` on `main`, 3 runs, now with the editor's rows. Time: 17 minutes for
  the first run, 9 for the second, 10 for the viewers.

### Budgets at a glance

**Bold** marks a broken budget.

| Budget | Target | v0.12.0 | main |
| --- | --- | --- | --- |
| Key to echo, terminal (median / p95) | 16 ms | 4.0 / 9.6 | 4.1 / 9.0 |
| Hotkey to window, socket (median / p95) | 100 ms | 8.3 / 10.9 | 8.5 / 12.0 |
| Hotkey to window, CLI, the GNOME shortcut of the `.deb` (median / p95) | 100 ms | 95.8 / **117.5** | 52.8 / 66.8 |
| Cold start, first prompt drawn | 2000 ms | 411 | 382 |
| Idle memory, 1 tab shown / 5 tabs hidden | 300 MB | 262 / 261 | 263 / 263 |
| 1000 item list | 60 fps | 60.0 | 60.0 |
| Nothing added to idle memory while no file was ever opened | 0 | | +1 MB, within the runs' spread |
| Opening a 1 MB file | 150 ms | | 46 (colored at 88) |
| Key to echo in the editor (median / p95) | 16 ms | | 7.0 / **18.8** |
| Memory added by an open file, per kind | reported | | [File view](#file-view) |

Everything holds but the editor's echo at p95. The CLI toggle, broken in the baseline and in v0.12.0, holds
again since #112.

### Boot and idle, no file opened

| | v0.12.0 | main | Budget |
| --- | --- | --- | --- |
| Key to echo, median / p95 (ms) | 4.0 / 9.6 | 4.1 / 9.0 | 16 |
| Key to echo, median to the DOM change (ms) | 3.0 | 3.0 | |
| Hotkey, socket, warm, median / p95 (ms) | 8.3 / 10.9 | 8.5 / 12.0 | 100 |
| Hotkey, socket, cold-ish, median (ms) | 9.0 | 8.3 | 100 |
| Hotkey, CLI, warm, median / p95 (ms) | 95.8 / **117.5** | 52.8 / 66.8 | 100 |
| Hotkey, CLI, cold-ish, median (ms) | 97.8 | 61.3 | 100 |
| Cold start, first prompt (ms) | 411 | 382 | 2000 |
| Cold start, runs (fastest to slowest) | 397 to 418 | 345 to 429 | |
| app ready / page loaded (ms) | 176 / 306 | 146 / 283 | |
| Memory, 1 tab, shown / hidden (MB) | 262 / 250 | 263 / 251 | 300 |
| Memory, 5 tabs, shown / hidden (MB) | 261 / 261 | 262 / 263 | 300 |
| Memory, RSS sum, 1 tab shown (MB) | 606 | 610 | |
| main / GPU / renderer / daemon, 1 tab (MB) | 85 / 19 / 64 / 43 | 85 / 18 / 66 / 42 | |
| CPU, idle prompt, shown / hidden (% of a core) | 0.9 / 1.3 | 1.0 / 1.5 | |
| CPU, TUI, shown / hidden (% of a core) | 5.3 / 2.4 | 5.0 / 2.1 | |
| Review's file list and diff, fps (frames over 20 ms) | 60.0 / 60.0 (0) | 60.0 / 60.0 (0) | 60 |

Memory, CPU and the list are the medians of 3 runs; `main`'s runs read 262 to 265 MB shown. The first
run's cold start read 492 ms for v0.12.0 (runs 385 to 829, the busy minute above) and 383 for `main`.

| Size (KB) | v0.12.0 | main |
| --- | --- | --- |
| `main.cjs` | 1110 | 1168 |
| `daemon.cjs` | 877 | 893 |
| UI JavaScript, all | 692 | 2412 |
| UI JavaScript loaded at start | 692 | 767 |
| UI CSS | 69 | 87 |
| `dck.mjs`, what `toggle` loads | 972 | 91 |
| `packages/shell/dist` without maps | 66664 | 68480 |

UI JavaScript "loaded at start" is the entry and what it imports statically (`xterm`, the cursor blink);
the rest of `main`'s 2412 KB is 127 chunks loaded by `import()`: CodeMirror (the `code-editor` chunk and its
packages), one per language of `@codemirror/language-data`, marked and DOMPurify.

### File view

`viewers.cjs` on `main`: each file in a launch of its own, opened from the file search (`Ctrl+Shift+O`,
Enter), median of 3 runs. First paint is from Enter to the end of the frame that shows the file; colors to
the frame where a line first holds a highlighted token (the TypeScript grammar loads with the first
TypeScript file of each launch). Memory is the PSS of every process of the launch against the moment
before the file opened; every row but the first opens after a small Markdown file, so the editor's code is
already loaded.

| File | first paint (ms) | colors (ms) | PSS added, shown (MB) | peak (MB) | after another file replaced it (MB) | processes added |
| --- | --- | --- | --- | --- | --- | --- |
| TypeScript 10 KB, first file of the launch | 60 | 109 | 21.6 | 25.7 | 26.2 | 0 |
| TypeScript 10 KB | 36 | 72 | 4.6 | 6.9 | 7.2 | 0 |
| TypeScript 1 MB | 46 | 88 | 16.5 | 17.0 | 17.7 | 0 |
| TypeScript 5 MB, editable, no colors | 101 | | 37.6 | 37.6 | 39.9 | 0 |
| PNG 4000x3000 | 437 | | 156.0 | 194.1 | 102.6 | 0 |
| JPEG 3600x2400 (2.4 MB) | 154 | | 33.5 | 33.5 | 11.8 | 0 |
| SVG | 94 | | 20.8 | 20.8 | 2.5 | 0 |
| README 100 KB, preview | 123 | | 29.0 | 30.1 | 16.5 | 0 |
| PDF 50 pages | 88 (frame loaded) | | 85.8 | 85.8 | 16.7 | 3 while it shows, 0 after |

| Key to echo in the editor (ms) | median | p95 | Budget |
| --- | --- | --- | --- |
| to the end of the frame | 7.0 | **18.8** | 16 |
| to the DOM change | 2.4 | 3.2 | |

180 letters typed with `xdotool` at the end of the 10 KB file's last line, 90 to 150 ms apart, none
missed; the three runs' p95 read 19.2, 18.7 and 17.5 ms. Percentiles of the frame: 6.2 (p25), 7.0, 10.6
(p75), 17.1 (p90), 18.8 (p95).

### What changed and why

- **With no file opened, nothing measurable moved.** Idle memory is 263 MB against 262 (`main`'s runs 262 to
  265), the renderer 66 MB against 64 for the 75 KB more JavaScript at start (the file search, the file
  tab, its menus and strips); CPU, terminal echo, the socket toggle and the list are flat, and cold start is
  382 ms against 411 (383 against 492 in the first run). The plan's first budget holds.
- **The editor stays out of the boot path.** The UI's JavaScript grew from 692 to 2412 KB, but what a
  start parses only from 692 to 767 KB: CodeMirror, every grammar, marked and DOMPurify load by `import()`
  on the first file that needs them. The CSS (69 to 87 KB, the editor's and the viewers' styles) and
  `main.cjs` (+58 KB: the file store, its watch, the merge, the protocol) do load at start, within the
  cold start's noise.
- **The editor's first load costs 60 ms and 22 MB.** A first 10 KB file shows 60 ms after Enter (36 ms once
  the code is loaded) and colors at 109 ms; its 21.6 MB, against 4.6 for the same file later, are
  CodeMirror and the TypeScript grammar. Nothing frees them when the file closes (26 MB after, the code
  stays loaded and the heap waits for a collection).
- **Opening a 1 MB file: 46 ms, colored at 88**, a third of the 150 ms budget; the 5 MB file shows in 101 ms,
  without colors as D83 set. CodeMirror draws only the viewport, so the time grows with the read and the
  copy over IPC more than with the text; memory grows with it: 4.6, 16.5 and 37.6 MB for 10 KB, 1 MB and 5
  MB. D83 read 80 ms to a colored 1 MB file when it was the first file of the launch.
- **Key to echo in the editor: median 7.0 ms holds, p95 18.8 breaks.** CodeMirror is not the cost: the
  letter is in the DOM 2.4 ms after the key (3.2 p95). The rest is the wait for a frame: half the keys get
  one within 4.5 ms of the DOM change, and one in four waits 8 to 17 ms, up to a refresh interval, where the
  terminal's frame ends 1 to 2 ms after its DOM change. Nothing animates: with the editor focused and idle
  the renderer uses 1.3 to 1.5 points of a core against 0.5 to 0.6 at a prompt and the GPU process the same
  0.2 (an ad hoc check, 2 launches), where the CSS blink D58 removed cost 2 to 3 points and kept every frame
  running. Likely, the frames each key brings after its echo (CodeMirror's measure, the parser's recolor)
  keep Chromium's frame clock ticking long enough that the next key now and then lands between two ticks; a
  trace would tell. D83 read 9.1 ms median and 13.3 p95 in the middle of the 1 MB file, with 120 keys.
- **The CLI toggle is back under budget**: 95.8 to 52.8 ms median, 117.5 to 66.8 p95, from #112 (D30's
  update), which ships a 91 KB `dck.mjs` with only the socket code in place of 972 KB.
- **The viewers** read as in D85, within the noise: the PNG 437 ms against 500, the JPEG 154 against 195,
  the SVG, the README and the PDF within 10 ms. What stays after the PNG closes (103 MB) is mostly the main
  process's read buffers, freed at its next collection (D85).

## Baseline, v0.2.0 to v0.11.0

Measured on 2026-11-19 so the next features (an in-app editor first) could be weighed against numbers.

### How

- **Builds**, each from source in its own `git worktree` with `pnpm install --frozen-lockfile` and
  `pnpm build`: v0.2.0 (the oldest tag), v0.6.0, v0.9.0, `main` (= v0.11.0, `75e6232`) and `next`, the
  local branch `perf/cursor-blink` (`1c3fadf`: main plus the timer cursor blink, D58). Every tag asks for
  Electron `^45.3.0` and all ran on the same 45.3.0 binary: no version mismatch. All five built.
  `origin/main` moved to v0.12.0 (`f6aeca8`) during the run; it ships the timer blink as #107, so `next`
  stands for 0.12.0 here, without its full height drag (#108) and lint cleanup (#106).
- **Machine**: a Linux container, 4 cores, 16 GB, no GPU, shared with other agent sessions. Xvfb
  1400x760x24, no window manager or compositor, so a frame ends when Chromium commits it, not when a
  screen shows it. Load average 0.1 to 0.4 during the run; the other processes on the machine used 1 to 3
  points of a core during each CPU sample, and CPU differences under about 0.5 point are noise. These
  numbers rank the builds; the maintainer should rerun the script on their Ubuntu (GNOME Wayland, real
  display) for absolute ones, and add up to a refresh interval to each latency there.
- **Isolation**: each launch has a fresh home (`PS1='dck-perf$ '`), config, state and socket, no D-Bus
  session and no tray icon.
- **No DevTools**: latencies come from a main process hook loaded through `NODE_OPTIONS` and a preload
  added to the page's session (`inject.cjs`, `probe.cjs`). Playwright stays out, since its DevTools
  session keeps `document.visibilityState` at `visible` after `hide()`. CPU and memory launches load no
  probe at all.
- **Repeats**: 3 launches per build and phase, the builds taken in turn. Latencies pool every sample
  (median, p95: 180 keys and 24 warm shows per build and path); cold start, memory and CPU are the median of
  the 3 runs. CPU follows `plans/terminal-rendering.md` on `perf/cursor-blink`: `utime+stime` per process
  and thread over 10 s, as a share of one core, the window hidden with `window.toggle` and 3 s to settle.
- **Time**: one full run (5 builds, 3 runs, every phase) took 43 minutes; one build takes about 9.

### Results

Budgets from AGENTS.md. **Bold** marks a broken budget.

#### Key to echo (ms)

From the `keydown` time stamp to the end of the frame that draws the letter, at an idle bash prompt, keys
90 to 150 ms apart.

| | v0.2.0 | v0.6.0 | v0.9.0 | main | next | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| median | 14.5 | 13.5 | 13.9 | 13.7 | 4.3 | 16 |
| p95 | **22.2** | **23.1** | **23.1** | **23.2** | 14.0 | 16 |
| median to the DOM change | 11.7 | 10.8 | 11.3 | 10.4 | 3.2 | |

#### Hotkey to visible window (ms)

From the toggle request to the end of the first frame after the page turns visible. `socket` sends
`window.toggle` to the daemon (the IPC part of every toggle; in dev mode and outside GNOME the key goes to
Electron's `globalShortcut`, which skips even that). `CLI` runs the `dck` bundle with Electron as Node,
as the packaged app's GNOME shortcut does (D30). Warm: hidden for about 1 s; cold-ish: hidden for 15 s.

| | v0.2.0 | v0.6.0 | v0.9.0 | main | next | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| socket, warm, median | 10.9 | 11.5 | 11.6 | 11.4 | 10.1 | 100 |
| socket, warm, p95 | 14.4 | 14.0 | 13.0 | 13.3 | 13.4 | 100 |
| socket, cold-ish, median | 11.8 | 10.6 | 12.7 | 11.5 | 8.9 | 100 |
| CLI, warm, median | 89.9 | 95.6 | **104.1** | **105.5** | **103.3** | 100 |
| CLI, warm, p95 | **132.0** | **118.6** | **134.3** | **129.4** | **130.9** | 100 |
| CLI, cold-ish, median | 91.4 | 95.6 | **105.8** | **104.2** | 94.6 | 100 |

Where the CLI path goes (median of 15 launches of `dck --help`, which loads the whole bundle and exits):
Electron as Node with an empty script takes 49 ms; loading the bundle adds 42 ms in v0.2.0 (826 KB) and
51 ms in main (952 KB). The socket, `show()` and the first frame add the 11 ms above.

#### Cold start (ms)

From spawning Electron to the end of the frame that first draws the prompt.

| | v0.2.0 | v0.6.0 | v0.9.0 | main | next | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| first prompt drawn | 345 | 329 | 405 | 430 | 410 | 2000 |
| runs (fastest to slowest) | 309 to 373 | 327 to 336 | 398 to 416 | 349 to 435 | 406 to 422 | |
| app ready | 170 | 150 | 174 | 176 | 183 | |
| page loaded | 277 | 262 | 304 | 329 | 308 | |

#### Idle memory (MB)

PSS from `smaps_rollup` of the main process, every Chromium child and the daemon; the shells in the tabs
are left out. RSS adds shared pages once per process and overstates the total.

| | v0.2.0 | v0.6.0 | v0.9.0 | main | next | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| 1 tab, shown | **313** | 262 | 263 | 264 | 263 | 300 |
| 1 tab, hidden | **306** | 250 | 250 | 252 | 252 | 300 |
| 5 tabs, shown | **319** | 264 | 263 | 264 | 263 | 300 |
| 5 tabs, hidden | **317** | 262 | 263 | 264 | 263 | 300 |
| RSS sum, 1 tab shown | 691 | 610 | 609 | 610 | 609 | |
| main / GPU / renderer / daemon, 1 tab | 83 / 74 / 62 / 41 | 85 / 20 / 64 / 42 | 85 / 19 / 66 / 42 | 85 / 19 / 66 / 43 | 86 / 19 / 65 / 43 | |

The two zygotes (27) and the network service (24 to 26) make up the rest.

#### Idle CPU (% of one core)

Renderer is the process total (its main thread / `Compositor`), GPU the process total
(`VizCompositorThread`). The TUI redraws a four line block 10 times a second with the cursor hidden, as
Claude Code's Ink does. No budget; for the trend.

| Workload | Window | | v0.2.0 | v0.6.0 | v0.9.0 | main | next |
| --- | --- | --- | --- | --- | --- | --- | --- |
| idle prompt | shown | renderer (main / Compositor) | 2.7 (1.6 / 1.0) | 2.6 (1.5 / 1.0) | 2.7 (1.5 / 1.0) | 2.8 (1.6 / 1.2) | 0.6 (0.3 / 0.2) |
| | | GPU (Viz) | 1.2 (0.9) | 1.2 (0.9) | 1.1 (0.8) | 1.3 (0.9) | 0.3 (0.1) |
| | | main / daemon | 0.2 / 0.0 | 0.1 / 0.0 | 0.2 / 0.0 | 0.1 / 0.0 | 0.1 / 0.0 |
| | | total | 4.1 | 3.9 | 4.0 | 4.2 | 1.0 |
| idle prompt | hidden | renderer / main / daemon | 0.3 / 0.6 / 0.4 | 0.3 / 0.7 / 0.4 | 0.4 / 0.7 / 0.3 | 0.4 / 0.8 / 0.4 | 0.3 / 0.6 / 0.4 |
| | | total | 1.3 | 1.4 | 1.4 | 1.5 | 1.2 |
| TUI | shown | renderer (main / Compositor) | 2.9 (1.4 / 1.0) | 3.1 (1.5 / 1.0) | 3.1 (1.6 / 1.0) | 3.3 (1.6 / 1.0) | 3.5 (1.9 / 1.1) |
| | | GPU (Viz) | 1.1 (0.9) | 1.2 (0.9) | 1.1 (0.8) | 1.1 (0.9) | 1.2 (1.0) |
| | | main / daemon | 0.6 / 0.0 | 0.7 / 0.0 | 0.6 / 0.0 | 0.6 / 0.0 | 0.6 / 0.0 |
| | | total | 4.6 | 5.0 | 4.8 | 5.0 | 5.4 |
| TUI | hidden | renderer / main / daemon | 0.7 / 1.1 / 0.3 | 0.8 / 1.2 / 0.3 | 0.7 / 1.1 / 0.3 | 0.8 / 1.1 / 0.4 | 0.8 / 1.2 / 0.4 |
| | | total | 2.1 | 2.3 | 2.1 | 2.2 | 2.3 |

#### A 1000 item list at 60 fps

The virtualized list here is the review's file index (and its diff, one scroll for every file). A tab
whose folder has 1000 changed files opens its review (Ctrl+Shift+D) and the wheel turns 50 notches a
second for 2 s over each; a `requestAnimationFrame` loop stamps the page's frames meanwhile. v0.2.0 has no
review.

| | v0.2.0 | v0.6.0 | v0.9.0 | main | next | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| file list: frames per second | | 60.0 | 60.0 | 60.0 | 60.0 | 60 |
| file list: p95 frame interval (ms) | | 16.7 | 16.7 | 16.7 | 16.7 | |
| file list: rows in the DOM, of 1000 | | 16 | 16 | 16 | 16 | |
| diff: frames per second | | 60.0 | 60.0 | 60.0 | 60.0 | 60 |
| frames over 20 ms, both | | 0 | 0 | 0 | 0 | |

Both scrolled the full 12000 px asked, with no frame over 20 ms in any run.

#### Size (KB)

| | v0.2.0 | v0.6.0 | v0.9.0 | main | next |
| --- | --- | --- | --- | --- | --- |
| `main.cjs` | 849 | 947 | 1056 | 1109 | 1109 |
| `daemon.cjs` | 784 | 834 | 864 | 877 | 877 |
| UI JavaScript | 502 | 597 | 652 | 691 | 692 |
| UI CSS | 32 | 45 | 62 | 68 | 69 |
| UI fonts | 0 | 0 | 296 | 296 | 296 |
| `dck.mjs` (CLI) | 826 | 876 | 958 | 952 | 972 |
| `packages/shell/dist` without maps | 65785 | 66042 | 66550 | 66662 | 66664 |

`dist` is 64 MB of node-pty's build tree, which packaging prunes. The main `.deb` (`pnpm package`, built
once here) is 88 MB and installs 271 MB: the Electron runtime is 265 MB of that, the app 3.8 MB and the CLI
0.96 MB.

### What changed and why, to v0.11.0

- **Memory, v0.2.0 to v0.6.0: 313 to 262 MB, back under budget.** The GPU process went from 74 to 20 MB
  when the window stopped using the GPU on Linux (D50, `c1774b1`, #50). Nothing since has moved the total:
  the renderer grew from 62 to 66 MB between v0.2.0 and main as the review, the GitHub views and the
  settings arrived, and the daemon by 2 MB.
- **Cold start, v0.6.0 to main: 329 to 430 ms.** Almost all of it is before the page finishes loading
  (262 to 329 ms): the UI's JavaScript grew from 597 to 691 KB and its CSS from 45 to 68 KB, the fonts
  became bundled files (296 KB, `e7f9a44`, #80), and `main.cjs` grew from 947 to 1109 KB (the GitHub client #69, the
  settings file #80, the updates #88). Still a fifth of the budget.
- **CLI toggle, v0.2.0 to main: 90 to 105 ms, now over budget on the path the packaged GNOME shortcut
  takes.** Half of it is Electron starting as Node and does not change. The other half is evaluating the
  bundle, which grew from 826 to 952 KB because `packages/cli/src/main.ts` imports the daemon, the
  connector views, the secret store, the extension files and the JSONC settings statically, so `toggle`
  loads all of them (extension commands #10 and #11, the macOS keychain #36, the settings file #80). D30
  measured 60 to 70 ms for `dck toggle` on the maintainer's machine; that was at v0.2.0, before this growth.
- **Idle CPU at a prompt and key echo did not move from v0.2.0 to main, then `next` cuts both.** The
  blinking cursor was an infinite CSS animation that Chromium runs every frame: 4.2 points of a core at a
  shown idle prompt in main, 1.0 with the timer blink (`f98fed7`, D58). The same change takes key to echo
  from 13.7 to 4.3 ms (p95 23.2 to 14.0), most of it before the DOM change (10.4 to 3.2 ms): with frames
  running for the animation, xterm's render waits for a frame slot; with the page idle, the echo gets a
  frame at once. This was not visible in the cursor-blink results, which measured CPU only.
- **TUI and hidden CPU are flat across releases** (about 5 points shown, 2 hidden). `next` reads 0.4 higher
  on the TUI, within the noise: the TUI hides its cursor, so the blink change does not apply. Hidden, the
  compositor and the GPU process stay at zero; what remains is xterm parsing the output, the main process carrying it, and the
  daemon.
- **The review's lists** hold 60 fps on 1000 files since they arrived in v0.6.0 (#42, #44), with 16 rows in
  the DOM at a time.

## Watch next

- **Broken now: key to echo in the editor at p95** (18.8 ms against 16; median 7.0). Trace a few keys (a
  Chromium trace of the renderer's frames) to find what draws after each echo and whether it can join the
  echo's frame or wait for idle. The terminal's p95 (9.0) is the target. The baseline's two broken budgets
  are fixed: the terminal's p95 by the timer blink (0.12.0) and the CLI toggle by #112.
- **Least headroom: memory.** The idle cockpit holds at 263 of 300 MB, but a file is not free once open: the
  first text adds 22 MB (the editor's code and a grammar), a 1 MB file 17 MB more and a 5 MB file 38, and
  closing a file gives back little until a collection. A cockpit that opened a 1 MB file sits near 300 MB,
  one with the 5 MB file open past it, and the PNG viewer adds 156 MB while it shows. Next: memory a minute
  after the last file closes (does the heap come back?), and whether the 5 MB limit for editing should
  wait for that.
- **Keep the editor out of the boot path.** The size table's "UI JavaScript loaded at start" row (767 KB)
  is the check: a static import of anything under `ui/src/editor` or `ui/src/viewers` would move the 1645
  KB loaded on demand into every start.
- **Cold start**, 382 of 2000 ms, has room; `main.cjs` keeps growing (1110 to 1168 KB with the file store).
- **Large files**: colors to 2 MB and editing to 5 MB hold the open under 110 ms; raising them toward VS
  Code's (files.md, "Later") should rerun these rows with 10 and 50 MB fixtures and the echo in a large
  colored file, where the parser's work after a key is largest.
- **TUI rendering**, about 5 points of a core per busy tab shown, is unchanged; the WebGL candidate in
  `plans/terminal-rendering.md` is the open lever, and the script's `tui` phase is its test.

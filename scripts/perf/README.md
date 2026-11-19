# Performance measurements

`measure.cjs` measures the budgets in [AGENTS.md](../../AGENTS.md) on one or more built checkouts, on an X
display of its own, and prints one table per metric with a column per build. The numbers in
[plans/performance.md](../../plans/performance.md) come from it. Nothing here touches your own cockpit:
every launch gets a fresh home, config, state and socket under the work folder, no D-Bus session and no
tray icon.

## Requirements

- Linux with `Xvfb` and `xdotool`.
- Node 24 and, in each checkout to measure, `pnpm install && pnpm build`.
- An Electron binary. Each checkout's own `packages/shell/node_modules/electron/dist/electron` is the
  default; a checkout made with `git worktree add` may lack it (pnpm skips the download), so pass
  `--electron` with another checkout's binary of the same version (`packages/shell/package.json` names it).

## Run

```bash
# This checkout only
node scripts/perf/measure.cjs

# Several builds side by side, each a built checkout
git worktree add --detach ../dck-v0.9.0 v0.9.0
(cd ../dck-v0.9.0 && pnpm install --frozen-lockfile && pnpm build)
node scripts/perf/measure.cjs --electron packages/shell/node_modules/electron/dist/electron \
  v0.9.0=../dck-v0.9.0 main=.

# The tables again from a saved run
node scripts/perf/measure.cjs --tables /tmp/dck-perf/results.json
```

Options: `--runs` (launches per build and phase, default 3), `--keys`, `--toggles`, `--cold-wait`,
`--cpu-seconds`, `--phases probe,idle,tui,list,size`, `--display` (default `:95`; an Xvfb is started
there when no X server answers, so pass your own display, for example `:0`, to measure on your desktop),
`--work` (keep it short: the daemon's socket goes in `<work>/run` and a Unix socket path holds 107 bytes)
and `--out`. One full run of 5 builds with the defaults takes about 45 minutes; one build about 9.

The script types, scrolls and moves the pointer with `xdotool` on that display: on your own desktop, leave
the keyboard and the pointer alone while it runs. `xdotool` reaches only X11 windows, so a desktop run needs
an X11 session (on Ubuntu, "Ubuntu on Xorg" at the login screen); in a Wayland one it finds no display.

The runs go round the builds (run 1 of every build, then run 2, ...) so a busy minute on a shared machine
does not land on one build. Each CPU table ends with what the rest of the machine used meanwhile, as a share
of one core: a large value there marks a noisy sample.

## What each phase does

- **probe**: launches with `inject.cjs` in Electron's main process (through `NODE_OPTIONS`) and
  `probe.cjs` as a preload in the page. Neither opens a DevTools session, which would keep the page
  visible after `hide()` and change what is measured. It records:
  - **cold start**: from spawning Electron to the end of the frame that first draws the bash prompt
    (`PS1='dck-perf$ '` from the throwaway home's `.bashrc`), with the main process start, app ready, page
    loaded and `show()` on the way;
  - **key to echo**: letters typed with `xdotool` at 90 to 150 ms apart into the bash prompt; from the
    `keydown` event's time stamp to the end of the frame whose DOM change shows the letter;
  - **hotkey to window**: from the toggle request to the end of the first frame after the page turns
    visible, warm (hidden for about 1 s) and cold-ish (hidden for `--cold-wait` seconds), by two paths:
    `socket` sends `window.toggle` on the daemon's socket (the IPC part of any toggle), and `cli` runs the
    `dck` CLI bundled as the `.deb` bundles it (by the build's own `buildCli` when it has one), with
    Electron as Node, which is what the GNOME shortcut of the packaged app runs (D30). In dev mode and
    outside GNOME the key goes to Electron's `globalShortcut` and skips both the CLI and the daemon, so
    `socket` is an upper bound for it.
- **idle**: a clean launch (no probe), the window shown and focused at an idle bash prompt. Memory is the
  PSS (and RSS) from `/proc/<pid>/smaps_rollup` of the main process, every Chromium child and the daemon;
  the shells in the tabs are left out. CPU is `utime + stime` from `/proc/<pid>/stat` and
  `/proc/<pid>/task/<tid>/stat` over `--cpu-seconds`, as a share of one core, by process and for the
  renderer's main and `Compositor` threads and the GPU process's `VizCompositorThread`. Then the window is
  hidden (`window.toggle` on the socket, 3 s to settle) and both are taken again; then 4 tabs are opened
  with Ctrl+Shift+T for the 5 tab memory, shown and hidden.
- **tui**: as idle, with `tui.cjs` in place of the shell: a four line status block redrawn 10 times a
  second with cursor moves and the terminal cursor hidden, as Claude Code's Ink does while it waits.
- **list**: a tab whose folder is a repository with 1000 changed files, and its review opened with
  Ctrl+Shift+D. The wheel (50 notches a second for 2 s, by `xdotool`) scrolls the virtualized file list,
  then the diff, while the probe stamps every frame of the page's main thread with
  `requestAnimationFrame`, where the lists draw their rows: frames per second, p95 interval, share of
  frames over 20 ms and the pixels scrolled. Builds without the review (before 0.6.0) report nothing.
- **size**: the size of `packages/shell/dist` and its parts, the UI's JavaScript loaded at start (the
  entry and what it imports statically; the rest loads by `import()` on first use), and the CLI bundled as
  the `.deb` ships it (its `dck.mjs`, what `toggle` loads). The `.deb` itself is `pnpm package` (Electron
  is most of it); the script does not build it.

## The file view: editor and viewers

`viewers.cjs` measures what the editor and each viewer of the file view cost (plans/files.md, F4b and F6),
on this checkout:

```bash
python3 scripts/perf/viewer-fixtures.py /tmp/dck-fixtures   # needs Pillow and reportlab
node scripts/perf/viewers.cjs --fixtures /tmp/dck-fixtures --electron <electron> --runs 3
```

Each file gets a launch of its own (with `inject.cjs` and `probe.cjs`, as the probe phase), whose tab starts
in the fixtures folder. A small Markdown file opens first, so the editor's code is loaded before anything is
counted; then the file search (`Ctrl+Shift+O`, typed with `xdotool`) opens the fixture, and the probe
reports the end of the frame that shows it: a text once CodeMirror holds it, an image or an SVG once its
bitmap is drawn, the README's preview once `Ctrl+Shift+J` has rendered it, a PDF once its frame has loaded
Chromium's viewer (the first page follows a few milliseconds later and is not seen by the page). A colored
text also reports its colors: the frame where a line first holds a token of the highlight style, after its
grammar has loaded (the TypeScript grammar loads with the first TypeScript file of a launch, in every
row). Memory is the PSS of the launch 2.5 s after the file shows, its highest value sampled every 50 ms
meanwhile, and 4 s after the small file replaced it, each against the moment before the fixture opened;
the table also counts the processes the viewer added while it showed and after.

The texts are TypeScript of 10 KB, 1 MB and just under 5 MB (colored to 2 MB and editable to 5 MB, D83).
The row "first file of the launch" opens the 10 KB one with nothing opened before, so it carries the
editor's own first load: its code, the TypeScript grammar and their memory.

Then, per run, **key to echo in the editor**: a launch opens the 10 KB file, goes to the end of its last
line (`// dck-echo:`) and types `--keys` letters (default 60; 0 skips it) 90 to 150 ms apart, as the
probe phase does at the prompt. From the `keydown` time stamp to the end of the frame after the DOM change
that shows the letter (Chromium inserts it in the input event, outside a frame). Auto save writes the
letters into the fixture, which is restored after the launch quits.

`DCK_VIEWERS=PNG,TypeScript` measures only the rows whose names start so. The results go to
`<work>/viewers.json`.

## Reading the numbers

- Absolute numbers belong to the machine. Under Xvfb there is no GPU and no compositing manager, the
  frame ends when Chromium commits it, not when a display shows it; on a real desktop add up to a
  refresh interval for the screen. Compare builds within one run of the script, and rerun it on the
  machine whose numbers matter.
- The latencies pool every sample of every run (median and p95); cold start, memory and CPU are the median
  of the per run values.
- The CPU sampling resolution is one clock tick (10 ms) over the window: 0.1 point of a core at 10 s.

## The file view's candidates (`files/`)

`files/` measures what the file view of [plans/files.md](../../plans/files.md) would load, inside a built
cockpit's own page; the numbers are in [plans/files-measurements.md](../../plans/files-measurements.md).
Its packages are not part of the workspace: `files/package.json` pins them and npm installs them there.

```bash
cd scripts/perf/files && npm install && node build.mjs     # bundles src/ into dist/
node build.mjs --sizes                                     # what each candidate weighs, minified and gzip
node fixtures.cjs /tmp/dck-f0/fixtures                     # texts, README, images, PDF, a small repository
node listing.cjs <repository> /tmp/dck-f0/<name>.paths     # git and ripgrep listing times
node measure.cjs --electron <binary> --lists /tmp/dck-f0/<name>.paths   # every scenario, 3 runs
```

- `hook.cjs` goes into the cockpit's main process through `NODE_OPTIONS`, as `inject.cjs` does, and opens a
  socket on which `measure.cjs` runs code in the page (`executeJavaScript`, no DevTools session) and takes
  screenshots (`capturePage`). `preload.cjs` serves the page's file reads over IPC, as the file view will
  get them, and the renderer's heap numbers.
- `src/bench.js` is imported into the page with a dynamic `import()`, as the file view would load the editor,
  and mounts each candidate over the tab: CodeMirror (`editor.js`, cursor blink by a timer), its Lezer
  grammars (`lezer.js`), Shiki as a CodeMirror plugin (`shiki.js`), images, Markdown and pdf.js
  (`viewers.js`) and a fuzzy ranking of paths (`rank.js`). F4 can start from these files.
- Each scenario is a fresh launch: memory (PSS of every process, as the idle phase, and the page's JS heap
  after `gc()`) before anything, after the bench loads, after the editor's code loads and after the file
  opens; the open's steps timed in the page; key to echo typed with `xdotool` into a new line in the middle
  of the file, from the `keydown` time stamp to the end of the frame that shows the letter.
- The cockpit's CSP blocks WebAssembly and its window has no plugins: while it runs, the script adds
  `'wasm-unsafe-eval'` and `dck-file:` sources to the built `index.html` (for Shiki's Oniguruma engine and
  the protocol rows) and, for the Chromium PDF scenarios only, `plugins: true` to the built `main.cjs`, and
  puts both back after each launch.
- `--phases protocol` (not in the default list) loads an image and the PDF through a `dck-file:` scheme
  that the hook registers and serves as the file view's bridge does, with `--fixtures` as its folder.
- `--phases shots` saves the side by side screenshots; run it on a display twice the usual size (for
  example `Xvfb :97 -screen 0 2800x1520x24`), since the page is drawn at a device scale factor of 2.

# Files: measurements (F0)

Task F0 of [files.md](files.md): what each kind of file costs in the cockpit, measured on 2026-11-19
before anything is kept. Harness: `scripts/perf/files/` ([README](../scripts/perf/README.md)).

## Method

- **Build**: `perf/baseline` (`75620a6`, v0.12.0 with the timer blink of D58), `pnpm build`, Electron
  45.3.0. Machine as in [performance.md](performance.md): Linux container, 4 cores, no GPU, Xvfb, shared.
  Absolute numbers belong to this machine; compare rows, and add up to a refresh interval on a real display.
- **Inside the real cockpit**: each scenario is a fresh, isolated launch (own home, config, state, socket,
  no tray). A main process hook (`NODE_OPTIONS`, no DevTools session) loads the bench into the cockpit's own
  page with a dynamic `import()` and mounts each candidate over the tab, with the cockpit's CSS variables
  and fonts, the terminal alive underneath. Files reach the page over IPC, as the file view will get them.
- **Memory**: PSS of every process of the launch (as the idle phase of the perf script) and the page's JS
  heap after `gc()`; deltas within one launch, each the median of 3 runs. The idle cockpit read 255 to
  258 MB here (264 in the baseline run). "Peak" samples PSS every 50 ms during the open.
- **Time**: from the open request (the IPC read included) to the end of the frame that shows the content
  (`requestAnimationFrame`, then a message posted from it). "Warm" is a second open in the same session.
- **Key to echo**: the perf script's method, in the editor: 40 letters per run typed with `xdotool` 90 to
  150 ms apart into a new line in the middle of the file, `keydown` time stamp to the end of the frame that
  shows the letter, 120 samples pooled per row. The cursor blinks with a 500 ms timer (D58) unless the row
  says otherwise.
- **Fixtures** (`fixtures.cjs`): TypeScript from this repository and Python from its standard library cut
  at 10 KB, 1 MB and 5 MB; a 1 MB README made of real READMEs; a 4000x3000 PNG (11 MB) and a 6000x4000
  JPEG (4.3 MB); a 50-page PDF with text, charts and photos (296 KB); a small repository.
- **CSP**: the cockpit's `default-src 'self'` lets the bench, images, module workers and frames load from
  `file:`, but blocks WebAssembly: the harness adds `'wasm-unsafe-eval'` to the built page for Shiki's
  Oniguruma engine, and `dck-file:` to `img-src`, `frame-src` and `object-src` for the protocol rows.

## Editor: CodeMirror 6, no syntax colors

Budgets: nothing added while no file was opened; open 1 MB under 150 ms; echo within 16 ms.

| | 10 KB | 1 MB TS | 1 MB Python | 5 MB TS |
| --- | --- | --- | --- | --- |
| first paint (ms) | 23 | 38 | 45 | 102 |
| warm first paint (ms) | 7 | 27 | 28 | 102 |
| of which IPC read (ms) | 1 | 10 | 11 | 46 |
| PSS added by the file (MB) | 3.5 | 12.3 | 12.3 | 36.3 |
| JS heap added by the file (MB) | 0.5 | 3.1 | 3.2 | 14.0 |
| echo median / p95 (ms) | 5.1 / 8.8 | 5.6 / 11.0 | 5.7 / 12.4 | 5.8 / 17.8 |

- **Before any file**: the bench loader adds 0.1 to 0.2 MB. Loading the editor's code (state, view,
  commands, search, language) takes 27 ms and adds 2.2 MB PSS and 0.9 MB of heap, which stay after the file
  closes. Nothing loads at start.
- **Cursor blink** (Lezer, 1 MB TS): timer 8.9 / 18.6 ms, no blink 10.0 / 32.8, CodeMirror's CSS animation
  18.3 / 29.3. The CSS blink doubles the median, as D58 found in the terminal; the timer is as good as none.
  For reference the terminal echoes at 4.3 / 14.0 ms on the same build ([performance.md](performance.md)).

## Syntax colors

On 1 MB files. Lezer is CodeMirror's own grammars (`@codemirror/language-data` picks the package by the
file name). Shiki runs as a CodeMirror plugin written for the spike (`src/shiki.js`): it keeps each line's
end state as VS Code does, retokenizes an edit until a line ends as before, colors the visible lines at
once and tokenizes the rest in 5 ms slices, keeping tokens for the visible lines only. One highlighter is
kept per engine and language.

| | Lezer TS | Shiki Onig. TS | Shiki JS TS | Lezer Py | Shiki Onig. Py | Shiki JS Py |
| --- | --- | --- | --- | --- | --- | --- |
| first colored paint (ms) | 93 | 280 | 446 | 62 | 132 | 152 |
| warm colored paint (ms) | 31 | 37 | 62 | 25 | 27 | 29 |
| highlighter set up, first time (ms) | | 39 | 10 | | 33 | 11 |
| whole file colored (ms) | 419 (on demand) | 4069 | 8590 | 399 (on demand) | 2071 | 1208 |
| PSS added by the file (MB) | 19.1 | 86.9 | 69.3 | 17.8 | 36.3 | 31.2 |
| JS heap added by the file (MB) | 4.5 | 7.2 | 23.4 | 4.6 | 6.0 | 7.1 |
| echo median / p95 (ms) | 8.9 / 18.6 | 6.4 / 17.8 | 7.2 / 18.0 | 7.5 / 17.8 | 6.0 / 13.1 | 6.0 / 15.1 |
| recolor work per key (ms, lines) | in the echo | 0.3, 2 | 0.5, 2 | in the echo | 0.2, 2 | 0.2, 2 |

- Both recolor within the frame of the echo: Lezer reparses incrementally in the same transaction, Shiki
  retokenizes two lines. The p95 over 16 ms is a frame slot (the DOM changes at a median of 4 to 5 ms).
- **Whole file**: Lezer parses only to the view plus 100 KB ahead and the rest on demand (419 ms for 1 MB
  when forced); Shiki has to run line by line from the top, 2 to 9 s of background CPU per 1 MB file. The
  Oniguruma engine's WebAssembly memory only grows, so its PSS stays (+87 MB on TypeScript).
- **5 MB TS with Lezer**: open 132 ms (warm 82), +45 MB. Typing right after a jump to the middle echoes at
  27.8 / 29.8 ms: until the parse reaches the view (about 3 s of idle work for 2.6 MB), every key spends
  CodeMirror's 20 ms parse budget (`Work.Apply`). Once it has, the same file echoes at 5 to 7 ms.
- **Fidelity** (screenshots below): on these snippets the tokens and colors match VS Code almost
  everywhere. Lezer's tags do not tell builtins (`str`, `int`), `self`, constants and the braces of
  template literals and f-strings from other names; TextMate scopes do, and VS Code's TypeScript adds
  semantic colors that neither has.

| | Lezer | Shiki |
| --- | --- | --- |
| languages | 33 with a Lezer grammar (25 packages plus 8 SQL dialects), 110 more through 94 legacy modes | 260 TextMate grammars (plus 100 aliases) |
| weak spots | legacy (lower fidelity): shell, C#, Kotlin, Ruby, Swift, Dockerfile, TOML, Lua, PowerShell, Dart, Scala | none of note; same grammars as VS Code |
| loads per language | `language-data` index 17.8 KB; `@lezer/lr` 26.5 KB once; lang-javascript 85 KB, lang-python 44 KB; legacy modes 3 KB median, 36 KB max | grammar per language: median 21 KB, p90 424 KB, max 3.2 MB (with what it embeds); TypeScript 177 KB, Python 68 KB |
| engine | none beyond CodeMirror | core 105 KB + Oniguruma 207 KB of JS (456 KB of wasm, needs `'wasm-unsafe-eval'`) or the JS regex engine 57 KB |

Screenshots, device scale factor 2, left Lezer with VS Code's token colors on the cockpit's background,
right Shiki with Dark Modern and Light Modern (their token colors are Dark+ and Light+), JetBrains Mono
13 px; reduced to 256 colors:
[TS dark](../docs/media/files-f0/snippet-ts-dark.png), [TS light](../docs/media/files-f0/snippet-ts-light.png),
[Python dark](../docs/media/files-f0/snippet-py-dark.png), [Python light](../docs/media/files-f0/snippet-py-light.png).

## Images

Shown fitted to the tab. `<img>` straight from the file; "bitmap 2048": `createImageBitmap` resized to 2048
px on the long side, drawn through a `bitmaprenderer` canvas. Deltas in MB against the cockpit before.

| | PNG 4000x3000 `<img>` | PNG bitmap 2048 | JPEG 6000x4000 `<img>` | JPEG bitmap 2048 |
| --- | --- | --- | --- | --- |
| first paint (ms) | 192 | 345 | 171 | 302 |
| PSS while shown | 63 | 51 | 125 | 57 |
| peak PSS while opening | 77 | 103 | 131 | 154 |
| PSS 4 s after closing | 61 | 25 | 123 | 33 |
| after `webFrame.clearCache()` | 43 | 9 | 90 | 2 |

- `<img>` keeps the whole decoded image (4 bytes a pixel: 46 and 92 MB) while shown, and Blink keeps most
  of it after the element is gone. Through a `dck-file:` protocol with `cache-control: no-store`, as #113
  serves it, the JPEG row is the same (125 shown, 123 after closing, 90 after `clearCache`).
- The resized bitmap holds about a quarter as much while shown and gives it all back once closed, but the
  full image is decoded once on the way, so the peak is higher.

## Markdown preview

Parser plus DOMPurify, the HTML inserted into one element; the 1 MB README makes 27 195 elements.

| | 1 MB, markdown-it | 1 MB, marked | 1 MB, marked, `content-visibility` | 100 KB, markdown-it | 100 KB, marked |
| --- | --- | --- | --- | --- | --- |
| first paint (ms) | 940 | 908 | 688 | 101 | 105 |
| parse / sanitize / layout and paint (ms) | 215 / 185 / 494 | 121 / 233 / 514 | 181 / 215 / 196 | 28 / 19 / 37 | 19 / 23 / 41 |
| PSS shown / peak | 148 / 199 | 149 / 198 | 93 / 121 | 17 / 21 | 15 / 20 |

Size: marked 50 KB (15 gzip), markdown-it 97 KB (41), DOMPurify 30 KB (12).

## PDF

The 50-page PDF over the tab.

| | pdf.js, worker | Chromium viewer, `file:` frame | Chromium viewer, `dck-file:` frame |
| --- | --- | --- | --- |
| first page on screen (ms) | 140 | 59 (seen in the window's pixels) | 122 (embed: 103) |
| PSS with the first page | 35 | 79 | 97 |
| PSS after paging to the end | 169 (6 pages kept) | 92 | 108 |
| PSS after closing | 63 (47 after `clearCache`) | 19 | 27 |
| extra processes while shown | none (a worker thread) | 2 renderers | 3 renderers |
| code to ship | 436 KB + 1.24 MB worker (132 + 371 gzip) | none | none |

- pdf.js drew every page it had shown into memory until the viewer released far canvases (+361 MB for 50
  pages without that); with 6 kept it still grows to +169 MB, which stays after closing.
- **`plugins: true`** in Electron 45 enables only the PDF viewer (no other plugin type remains). It costs
  nothing while no PDF shows: same idle PSS and processes. A PDF in a frame starts the viewer's extension
  frame and PDFium in renderer processes of their own, which exit when the frame goes. Through `dck-file:`
  the frame is cross-site to the `file:` page, so site isolation adds one more process (+18 MB). It works
  with the scheme as #113 registers it (`standard`, `secure`, `stream`) served by `protocol.handle`, in an
  `iframe` or an `embed`.
- **Security**: pdf.js parses in JavaScript in our renderer (memory-safe; its eval path, CVE-2024-4367, is
  gone in v6 and our CSP forbids eval anyway). The Chromium viewer runs PDFium, C++, but in sandboxed
  renderers of its own (the harness ran with `--no-sandbox`; the app does not), and is updated with
  Electron. Enabling plugins lets any frame of the page show a PDF from a source the CSP allows, so
  `frame-src`/`object-src` must name `dck-file:` only; links inside a PDF navigate its frame (deny them
  with `will-frame-navigate` and open them outside); its toolbar's download and print need a
  `will-download` handler and the print dialog.

## File search

Listing, ms, median of 6 runs after a first one (files already cached). Repositories: `acme` (fixture, 153
tracked), this one (725 listed: tracked plus the spike's untracked files), and
[mui/material-ui](https://github.com/mui/material-ui) shallow with `pnpm install` (41 590 tracked, 156 882
files with `node_modules`).

| | acme | dck | MUI |
| --- | --- | --- | --- |
| `git ls-files --cached --others --exclude-standard` | 6.0 (154) | 6.7 (725) | 61.7 (41 590) |
| `git ls-files --recurse-submodules` (tracked only) | 4.0 | 4.0 | 17.0 |
| `git ls-files --others --ignored --exclude-standard --directory` | 4.0 (3) | 4.0 (26) | 46.4 (29) |
| `git ls-files --others --ignored --exclude-standard` (every file) | 3.9 (641) | 20.3 (11 418) | 327 (122 183) |
| `rg --files` (ripgrep 14.1.0) | 8.2 | 11.3 | 85.8 |
| `rg --files --hidden -g '!.git'` | 8.0 | 11.2 | 134.5 |

`--recurse-submodules` refuses `--others` ("unsupported mode"): tracked files with it, untracked in a
second call. On MUI most of the 62 ms is the untracked walk.

Ranking in the renderer's main thread, per key, as each prefix of 6 queries is typed (a scorer of
subsequence, word starts, runs and name first, `src/rank.js`). "Narrowed": a longer query only ranks what
the shorter one matched. 100k is MUI's tracked list plus 58 410 of its ignored files (paths 107 characters
on average).

| | acme 154 | dck 725 | MUI 41 590 | 100 000 |
| --- | --- | --- | --- | --- |
| IPC read + split and index (ms) | 1 + 3 | 4 + 3 | 23 + 35 | 57 + 71 |
| JS heap / PSS held by the list (MB) | 0 / 0.2 | 0.1 / 0.4 | 6.5 / 11.1 | 24.9 / 47.9 |
| rank per key, median / p95 / max (ms) | 0 / 0.2 / 0.7 | 0.1 / 0.4 / 4.2 | 5.4 / 11.6 / 23.7 | 11.4 / 21.9 / 35.5 |
| narrowed, median / p95 / max (ms) | 0 / 0.1 / 0.2 | 0.1 / 0.3 / 4.7 | 3.0 / 7.6 / 15.4 | 8.3 / 13.5 / 16.0 |

The PSS of the 100k list stayed after it was dropped (+56 MB).

## Not measured

- Absolute numbers on the maintainer's machine (real display, GPU compositing off as D50) and macOS.
- Shiki with semantic tokens, and VS Code itself (not installed here): Shiki with Dark Modern stands for it.
- `ImageDecoder` (WebCodecs) with `desiredWidth`, which may decode a JPEG at a lower scale without the full
  size peak: worth a try in F4.
- A cold file system cache for the listings (dropping it would disturb the shared machine).
- Chromium's viewer's first page is read from the window's pixels every 15 ms (the first frame with 15%
  white), so its times are within about 20 ms.

## Recommendation

- **Editor**: CodeMirror 6, loaded on the first open; timer blink as measured. Opening 1 MB takes 38 to 93
  ms (25 to 31 warm), well under 150; idle adds nothing until a file opens, then 2.2 MB of code that stays.
- **Syntax colors: Lezer**, the palette in `tokens.json`. On 1 MB it colors in 62 to 93 ms against 132 to
  446 for Shiki, adds 18 to 19 MB against 31 to 87, never tokenizes the whole file, needs no WebAssembly
  (Shiki's Oniguruma engine needs `'wasm-unsafe-eval'` in the CSP; its JS engine is slower to start) and
  no second editor integration to maintain. The colors are VS Code's on the snippets; what it lacks
  (builtins, `self`, template braces) is a palette and tag detail. Shiki covers far more languages well
  (260 against 33); the legacy modes cover the rest at lower fidelity. Revisit Shiki for a language only if
  a user finds its legacy mode wrong, and for the review's diff use Lezer's `highlightTree`, the same
  palette.
- **Limits for colors**: syntax colors up to 2 MB; from 2 to 5 MB the editor stays editable without
  colors (5 MB plain: open 102 ms, echo 5.8 / 17.8 ms), since a jump deep into a larger file costs up to
  20 ms a key until the parse catches up. Read only over 5 MB and the card over 50 MB, as #113's
  `FILE_LIMITS` already says.
- **Images: keep**, through `dck-file:`; add it to `img-src`. Draw them resized to the view at device
  pixels (at most 2048 px on the long side) with `createImageBitmap`, and `close()` the bitmap when the
  image closes. The decode on the way peaks at about 1.6 times the full decoded size (+154 MB for 24
  megapixels) for a few hundred ms, so an image over 50 megapixels shows the card. `createImageBitmap` can
  take the `<img>` loaded from the scheme, so the scheme needs no `supportFetchAPI`. If F4 keeps plain
  `<img>` instead, call `webFrame.clearCache()` from the preload after closing.
- **Markdown: keep**, with marked and DOMPurify (80 KB, 27 gzip, loaded on first preview), remote images
  off, `content-visibility: auto` on the blocks. Preview up to 200 KB (100 KB: 105 ms, +15 MB); a larger
  file opens in the editor with the preview off.
- **PDF: keep, with Chromium's viewer** (`plugins: true` on the main window, a frame of
  `dck-file://open/<id>`): first page in 60 to 120 ms, about +80 to +100 MB only while shown, +19 to +27
  MB left once it closes (its processes exit), nothing to ship. pdf.js would add 1.7 MB of code and keep +47 to +169 MB after use.
  With #113: add `dck-file:` to `frame-src` (or `object-src` for an `embed`), deny navigation and new
  windows from the frame, handle `will-download`.
- **File search**: no worker for listing (62 ms for MUI's 41 590 files; ignored folders closed in 46 ms).
  Rank on the main thread with narrowing up to about 50 000 paths (p95 7.6 ms at 41 590). Past that,
  rank where the list is made (the host) and send the top rows: 100 000 paths cost the renderer 25 MB of
  heap and 48 MB of PSS that do not come back, more than the 36 MB of headroom.

**Packages the implementation adds** (versions measured; sizes minified, gzip, loaded on first use):

| Package | Version | Size |
| --- | --- | --- |
| `@codemirror/state`, `view`, `commands`, `search`, `language` | 6.7.6, 6.43.15, 6.11.1, 6.7.2, 6.13.1 | 360 KB, 117 KB together, with `@lezer/common` 1.5.5, `@lezer/highlight` 1.2.5, `style-mod` 4.1.5, `w3c-keyname` 2.2.8, `crelt` 1.0.7 |
| `@codemirror/language-data` | 6.5.2 | index 18 KB, 3 KB; each language loads alone (above), with `@lezer/lr` 1.4.12 (27 KB, 9 KB) once |
| `marked` | 18.2.1 | 50 KB, 15 KB |
| `dompurify` | 3.4.18 | 30 KB, 12 KB |

Not added: Shiki (`@shikijs/*` 4.6.0), markdown-it 15.0.3, pdfjs-dist 6.5.438.

**Fit with the files core (#113).** `FILE_LIMITS` already holds the read only (5 MB) and card (50 MB)
limits measured here; F0 adds three, for `core/src/files/file-kind.ts` or the view in F4: syntax colors up
to 2 MB, the Markdown preview up to 200 KB, and the card for images over 50 megapixels (the header gives
the size before any decode). The `dck-file:` scheme as registered (`standard`, `secure`, `stream`, no
`supportFetchAPI`, `no-store`) serves both kinds as measured: images through `<img>` (add `dck-file:` to
`img-src`) and PDF in a frame with `plugins: true` (add it to `frame-src`, or `object-src` for an
`embed`). `no-store` does not free an `<img>`'s decoded pixels after it closes; the bitmap does.

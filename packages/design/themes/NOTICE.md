# Built-in themes: sources and licenses

The themes in this folder use the cockpit's theme format (`plans/themes.md`): what a file leaves out comes
from dck's own Dark or Light. Every one passes the contrast checks of `src/contrast.ts` (WCAG AA, 4.5:1 for
text on every ground the editor and the terminal draw on, 3:1 for graphics), tested in
`src/builtin-themes.test.ts`. Where a source color failed a pair, it was moved the least needed, in
lightness only, keeping its hue and saturation; a tint the cockpit derives (search matches, diff lines) gave
way first, toward the window color, as long as it stayed a visible tint.

## dck's palettes

dck vivo, Grafite, Terra and Sinal are dck's own, with no outside source. They started as the editor
palettes the maintainer explored on 2026-11-19 and are whole themes since D94: interface, terminal and
syntax. Sálvia's sage strings and Estrutura's bright declarations live on in Grafite. A role is a color (no
bold or italic). Colors moved, in lightness only, to pass every pair:

- dck vivo: light `colors.controlLine` #7f969a to #738a8e, light `syntax.comment` #536a6f to #4a6166.
- Grafite: dark quiet greys (`operator`, `punctuation`, `comment`, brackets) #989ba0 to #a0a3a8 and
  keywords #9fa2a7 to #abaeb3; light `colors.controlLine` #868a90 to #7c8086, keywords #5b5f66 to #4e5258,
  quiet greys #5f636a to #52565c.
- Terra: dark quiet greys #a69888 to #b0a292; light keywords and quiet greys #6a5c4e to #625448.
- Sinal: light `syntax.comment` #8a5d00 to #7f5500, light `colors.searchCurrent` #f5dc9a to #f8e4b0.

## GitHub (`github-dark.json`, `github-light.json`)

From GitHub's VS Code theme, Dark Default and Light Default, and the Primer colors it is built on
(<https://github.com/primer/github-vscode-theme>, <https://github.com/primer/primitives>).
Copyright (c) 2020 Primer. MIT License. Moved:

- Dark:
  - `colors.searchCurrent` #44371a to #322a1a
  - `terminal.brightBlack` #6e7681 to #757e89
  - `syntax.invalid` #f85149 to #f85d55
- Light:
  - `colors.diffAdd` #e4f0e7 to #ecf4ee
  - `colors.diffRemove` #f9e5e6 to #f9ebec
  - `terminal.brightBlue` #218bff to #0072f0
  - `terminal.brightMagenta` #a475f9 to #8c50f7
  - `terminal.brightCyan` #3192aa to #2b7f94
  - `terminal.brightWhite` #8c959f to #6d7883
  - `syntax.storage` #cf222e to #c6212c
  - `syntax.control` #cf222e to #c6212c
  - `syntax.operator` #cf222e to #c6212c

## One Dark Pro (`one-dark-pro.json`)

From One Dark Pro (<https://github.com/Binaryify/OneDark-Pro>). Copyright (c) 2013-2022 Binaryify. MIT License.
Its text and comments are dim for the cockpit's grounds (a selection is the text color at 12% over the
window), so most moved. Moved:

  - `colors.fg` #abb2bf to #b5bbc7
  - `colors.muted` #7f848e to #8f949c
  - `colors.accentInk` #282c34 to #252830
  - `colors.diffAddWord` #435045 to #3b4641
  - `colors.diffRemove` #3e343c to #32323a
  - `colors.diffRemoveInk` #e06c75 to #e47d85
  - `colors.searchMatch` #4d443f to #413c3a
  - `colors.searchCurrent` #5d5548 to #3d3c3c
  - `terminal.red` #e05561 to #e46d77
  - `terminal.magenta` #c162de to #c66fe1
  - `terminal.brightBlack` #4f5666 to #8b93a5
  - `syntax.storage` #c678dd to #d090e3
  - `syntax.control` #c678dd to #d090e3
  - `syntax.constant` #d19a66 to #d29d6a
  - `syntax.number` #d19a66 to #d29d6a
  - `syntax.property` #e06c75 to #e78e95
  - `syntax.variable` #e06c75 to #e78e95
  - `syntax.comment` #7f848e to #a4a7ae
  - `syntax.invalid` #f44747 to #f88686
  - `syntax.bracket1` #d19a66 to #d29d6a
  - `syntax.bracket2` #c678dd to #d090e3

## Dracula (`dracula.json`)

From Dracula for Visual Studio Code and the Dracula color spec (<https://github.com/dracula/visual-studio-code>,
<https://draculatheme.com/contribute>). Copyright (c) 2016 Dracula Theme. MIT License. Its comment color
reads at 3:1 on its own background, so it moved most. Moved:

  - `colors.muted` #6272a4 to #8490b8
  - `colors.diffRemove` #422f3a to #362f3a
  - `colors.diffRemoveInk` #ff5555 to #ff6767
  - `colors.searchMatch` #574942 to #4a413e
  - `colors.searchCurrent` #60644e to #414341
  - `terminal.brightBlack` #6272a4 to #8490b8
  - `syntax.storage` #ff79c6 to #ff88cd
  - `syntax.control` #ff79c6 to #ff88cd
  - `syntax.constant` #bd93f9 to #c49ffa
  - `syntax.number` #bd93f9 to #c49ffa
  - `syntax.operator` #ff79c6 to #ff88cd
  - `syntax.comment` #6272a4 to #a6afcb
  - `syntax.invalid` #ff5555 to #ff9090
  - `syntax.bracket2` #ff79c6 to #ff88cd

## MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without
limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
Software, and to permit persons to whom the Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

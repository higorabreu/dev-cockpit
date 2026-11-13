---
paths:
  - "packages/ui/**"
  - "packages/design/**"
---

# UI and design system

- Source of truth: `packages/design/tokens.json`. The CSS variables and the xterm theme are generated from it
  so the terminal and the panel share a palette. No literal color, size or font in a component: use a token.
- Direction: calm and dense, Linear style. A clean single-column list, state in shape and color together,
  only the semantic color draws attention, minimal motion. AI is not a character: no chat bubble, sparkle
  icon, purple gradient or robot avatar; it appears as a verifiable result (a diff, a suggestion with source).
- **Tooltip:** only the design system's (`ui/src/kit/tooltip.ts`), never the native `title`. Text cut by an
  ellipsis shows its full content by itself; `data-tip` always shows a text (icons, counters, arrows);
  `data-tip-full` gives the whole text when the visible one is part of it; an icon with no label gets
  `data-tip` with its name; a shortcut goes in `data-tip-key`, never in the text.
- **Scrollbar:** only the design system's, the `scroll` class (transparent track, thin thumb that shows
  while scrolling or hovering, sizes in `size.scrollbar`). Every scrolling list carries `scroll` and touches
  the card edges (breathing room is padding inside it). The only exception is the tab strip. No
  `scrollbar-width` or `::-webkit-scrollbar` outside the component. The strip is empty at rest, so it never
  reads as a wider right margin: a list with padding calls `watchOverflow` (`kit/scrollbar.ts`), and while
  it overflows the strip replaces its right padding and the left one matches it; a list whose rows run edge
  to edge adds `scroll-edges`, which reserves the strip on both sides, and gives that space back from its
  inner padding so the text keeps its place.
- Git and developer terms follow VS Code and the verbs developers already use (pull, push, commit, branch);
  no free translation and no Incoming or Outgoing. Fonts: Inter for text, JetBrains Mono for keys, branches
  and commands. No emoji.
- New interface text goes through the translator in both catalogs; the language follows the system and the
  user's choice lives in settings.
- **Pointer:** everything the user can click shows `cursor: pointer` and a disabled control does not. The
  rule lives once in `styles/base.css` for native controls and clickable roles; a clickable element that is
  neither (a `div` row with a click handler) sets it in its own style. A component never sets `cursor:
  default` on a control. Text fields keep the text cursor.
- Styles for a feature go in its file in `ui/src/styles/`, imported in order by `styles/index.css`.
- Components are keyboard accessible with the shortcut visible beside the action (see the accessibility rule).

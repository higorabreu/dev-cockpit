---
paths:
  - "packages/ui/**"
  - "packages/design/**"
---

# Accessibility (WCAG 2.2 AA, dark and light themes)

- Text contrast at least 4.5:1 (3:1 for large text); icons, borders and state indicators at least 3:1,
  measured against the element's real background. Never use `opacity` to fade text or icons: use a solid
  color token.
- Contrast is verified by a test over the tokens in `packages/design`; a new token or color pair comes with
  its check.
- State is never by color alone: selection and focus also change shape, outline or weight.
- Everything is keyboard operable with a visible focus, and motion respects `prefers-reduced-motion`.
- Every action with a keyboard shortcut can also be done with the mouse (button, menu or click) and the
  shortcut shows in its tooltip (`data-tip-key`). Every list scrolls with the mouse wheel. A new shortcut is
  born with its mouse path.
- With the transparent window the guarantee holds for the default opacity (0.92); below it the real
  desktop background counts.

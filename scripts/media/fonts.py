# The cockpit's own fonts, from the repository's node_modules, for everything the scripts draw
import glob
import os

from PIL import ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FILES = {
    'sans': 'node_modules/.pnpm/@fontsource-variable+inter@*/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
    'mono': 'node_modules/.pnpm/@fontsource-variable+jetbrains-mono@*/node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
}
_cache = {}


def font(kind, size, weight=400):
    key = (kind, round(size), weight)
    if key not in _cache:
        found = sorted(glob.glob(os.path.join(ROOT, FILES[kind])))
        if not found:
            raise SystemExit(f'font {kind} not found: run pnpm install first')
        f = ImageFont.truetype(found[-1], round(size))
        f.set_variation_by_axes([weight])
        _cache[key] = f
    return _cache[key]


# The dark theme's colors in packages/design/tokens.json
DARK = {
    'bg': (14, 14, 14),
    'surface': (27, 27, 27),
    'line': (43, 43, 43),
    'tab': (38, 38, 38),
    'fg': (230, 230, 230),
    'muted': (140, 140, 140),
    'critical': (240, 122, 104),
    'success': (92, 199, 154),
    'warning': (226, 176, 85),
    'blue': (110, 168, 221),
    'magenta': (197, 134, 192),
    'cyan': (78, 201, 212),
}

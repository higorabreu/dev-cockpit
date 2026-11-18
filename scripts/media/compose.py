# Edits a raw recording into a README clip: speed per segment, eased zooms on the part that matters, and
# captions drawn as the app draws its hint bar (a dark card, light text, keycaps), from the dark tokens.
# Usage: python3 compose.py <work dir> <scene> <out.mp4>; timings come from <work>/events/<scene>-record.json
import json
import subprocess
import sys

from PIL import Image, ImageDraw

from clips import SCENES
from fonts import DARK, font

WORK, SCENE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
SRC_W, SRC_H, FPS = 1280, 720, 30
events = json.load(open(f'{WORK}/events/{SCENE}-record.json'))
cfg = SCENES[SCENE](events)
OUT_W, OUT_H = cfg.get('size', (960, 540))
# Raw time = event time + the second ffmpeg runs before the first mark
OFFSET = cfg.get('offset', 0.88)
FULL = (0, 0, SRC_W, SRC_H)
CAMERA = cfg.get('camera', [(0, FULL), (10_000, FULL)])
SEGMENTS = cfg['segments']
CAPTIONS = cfg.get('captions', [])


def ease(x):
    return x * x * (3 - 2 * x)


def camera_at(t):
    for (t0, r0), (t1, r1) in zip(CAMERA, CAMERA[1:]):
        if t0 <= t <= t1:
            k = 0 if t1 == t0 else ease((t - t0) / (t1 - t0))
            return tuple(a + (b - a) * k for a, b in zip(r0, r1))
    return CAMERA[-1][1]


times = []
for start, end, speed in SEGMENTS:
    n = round((end - start) / speed * FPS)
    times += [start + i * speed / FPS for i in range(n)]

TEXT = font('sans', 17, 500)
CAP = font('mono', 13, 500)
PLUS = font('sans', 13)


def keycaps(d, x, y, keys, draw=True):
    for i, key in enumerate(keys):
        if i:
            if draw:
                d.text((x + 3, y + 3), '+', font=PLUS, fill=DARK['muted'])
            x += 14
        w = d.textlength(key, font=CAP) + 14
        if draw:
            d.rounded_rectangle((x, y, x + w, y + 22), 4, fill=DARK['tab'], outline=DARK['line'])
            d.line((x + 3, y + 22, x + w - 3, y + 22), fill=(20, 20, 20))
            d.text((x + 7, y + 3), key, font=CAP, fill=DARK['fg'])
        x += w
    return x


def caption_layer(text, keys, alpha, top):
    layer = Image.new('RGBA', (OUT_W, OUT_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    tw = d.textlength(text, font=TEXT)
    kw = keycaps(d, 0, 0, keys, draw=False) if keys else 0
    w = 16 + tw + (12 + kw if keys else 0) + 16
    h = 38
    x0 = round((OUT_W - w) / 2)
    y0 = 8 if top else OUT_H - h - 8
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), 8, fill=DARK['surface'] + (246,), outline=DARK['line'])
    d.text((x0 + 16, y0 + 8), text, font=TEXT, fill=DARK['fg'])
    if keys:
        keycaps(d, x0 + 16 + tw + 12, y0 + 8, keys)
    if alpha < 1:
        layer.putalpha(layer.getchannel('A').point(lambda v: int(v * alpha)))
    return layer


def caption_at(t):
    for start, end, text, keys, *where in CAPTIONS:
        if start <= t < end:
            # A caption the clip opens with is whole on the first frame, the still GitHub shows
            fade_in = 1 if start <= 0 else (t - start) / 0.2
            alpha = min(1, fade_in, (end - t) / 0.2)
            return text, tuple(keys), max(0, alpha), bool(where)
    return None


cache = {}


def caption_image(text, keys, alpha, top):
    key = (text, keys, round(alpha, 2), top)
    if key not in cache:
        cache[key] = caption_layer(text, keys, alpha, top)
    return cache[key]


def main():
    raw = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', f'{WORK}/raw/{SCENE}.mp4', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{OUT_W}x{OUT_H}', '-r', str(FPS), '-i', '-',
                            '-c:v', 'libx264', '-crf', '12', '-preset', 'slow', '-pix_fmt', 'yuv444p', OUT], stdin=subprocess.PIPE)
    size = SRC_W * SRC_H * 3
    index, frame = -1, None
    for t in times:
        want = round((t + OFFSET) * FPS)
        while index < want:
            buf = raw.stdout.read(size)
            if len(buf) < size:
                break
            frame, index = buf, index + 1
        src = Image.frombuffer('RGB', (SRC_W, SRC_H), frame)
        x, y, w, h = camera_at(t)
        img = src.resize((OUT_W, OUT_H), Image.LANCZOS, box=(x, y, x + w, y + h)).convert('RGBA')
        c = caption_at(t)
        if c and c[2] > 0:
            img = Image.alpha_composite(img, caption_image(*c))
        enc.stdin.write(img.convert('RGB').tobytes())
    enc.stdin.close()
    enc.wait()
    raw.kill()
    print(SCENE, 'seconds', round(len(times) / FPS, 1))


main()

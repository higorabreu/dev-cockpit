# The files viewers.cjs opens: a 4000x3000 PNG, a 2.4 MB JPEG, an SVG, a 100 KB README with a relative
# and a remote image, a 50-page PDF with a web link, and a small text that closes each viewer.
# Needs Pillow and reportlab. Usage: python3 viewer-fixtures.py <folder>
import os
import random
import sys

from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

root = sys.argv[1]
media = os.path.join(root, 'media')
docs = os.path.join(root, 'docs')
os.makedirs(os.path.join(docs, 'img'), exist_ok=True)
os.makedirs(media, exist_ok=True)
rng = random.Random(3)


# A gradient under rings and noise, so the PNG does not compress to nothing
def scene(width, height):
    image = Image.linear_gradient('L').resize((width, height)).convert('RGB')
    red, green, blue = image.split()
    image = Image.merge('RGB', (red, green.rotate(90), blue.point(lambda value: 255 - value)))
    draw = ImageDraw.Draw(image)
    for _ in range(400):
        x, y = rng.randrange(width), rng.randrange(height)
        size = rng.randrange(20, max(21, width // 12))
        color = tuple(rng.randrange(256) for _ in range(3))
        draw.ellipse((x, y, x + size, y + size), outline=color, width=max(2, width // 800))
    noise = Image.effect_noise((width, height), 40).convert('RGB')
    return Image.blend(image, noise, 0.18)


scene(4000, 3000).save(os.path.join(media, 'photo-4000x3000.png'))
scene(3600, 2400).save(os.path.join(media, 'photo.jpg'), quality=84)
scene(800, 420).save(os.path.join(docs, 'img', 'shot.png'))

with open(os.path.join(media, 'logo.svg'), 'w') as svg:
    svg.write(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="480" height="320">\n'
        '  <rect x="4" y="4" width="112" height="72" rx="12" fill="#1f5fbf"/>\n'
        '  <circle cx="40" cy="40" r="22" fill="#e2b055"/>\n'
        '  <path d="M70 58 L92 22 L108 58 Z" fill="#5cc79a"/>\n'
        '</svg>\n'
    )

WORDS = 'mail draft sender account inbox thread reply folder'.split()
readme = [
    '# Acme Mail',
    '',
    'See [the guide](guide.md) and the [project page](https://example.com/acme).',
    '',
    '![Screenshot](img/shot.png)',
    '',
    '![Build status](https://img.shields.io/badge/build-passing-green.svg)',
    '',
    '| Option | Default |',
    '| --- | --- |',
    '| `autoSave` | `true` |',
    '',
    '- [x] Drafts are checked',
    '- [ ] Attachments are scanned',
    '',
]
section = 0
while sum(len(line) + 1 for line in readme) < 100 * 1024:
    section += 1
    readme += [
        f'## Section {section}',
        '',
        ' '.join(rng.choice(WORDS) for _ in range(60)) + '.',
        '',
        '```python',
        f'def step_{section}(draft):',
        '    return draft.sender or None  # the default sender',
        '```',
        '',
    ]
with open(os.path.join(docs, 'README.md'), 'w') as out:
    out.write('\n'.join(readme) + '\n')
with open(os.path.join(docs, 'guide.md'), 'w') as out:
    out.write('# Guide\n\nThe small text that closes each viewer.\n')

# 50 pages of text, a chart every five and a photo every ten, a web link on the first
PDF_WORDS = (
    'cockpit terminal session review branch commit window tab file editor search project agent shell '
    'memory budget frame latency process renderer daemon socket settings theme token palette'
).split()
pdf = canvas.Canvas(os.path.join(media, 'manual.pdf'), pagesize=A4)
width, height = A4
for number in range(1, 51):
    pdf.setFont('Helvetica-Bold', 16)
    pdf.drawString(2 * cm, height - 2.5 * cm, f'Chapter {number}: {rng.choice(PDF_WORDS).title()}')
    text = pdf.beginText(2 * cm, height - 3.5 * cm)
    text.setFont('Times-Roman', 11)
    for _ in range(50 if number % 5 else 18):
        text.textLine(' '.join(rng.choice(PDF_WORDS) for _ in range(14)).capitalize()[:95])
    pdf.drawText(text)
    if number % 5 == 0:
        for bar in range(12):
            pdf.setFillColorRGB(rng.random(), 0.4, 0.7)
            pdf.rect(2 * cm + bar * 1.4 * cm, 3 * cm, 1 * cm, rng.uniform(2, 9) * cm, fill=1)
    if number % 10 == 0:
        pdf.drawImage(os.path.join(media, 'photo.jpg'), 2 * cm, 12.5 * cm, width=16 * cm, height=10 * cm)
    if number == 1:
        pdf.setFont('Helvetica', 12)
        pdf.drawString(2 * cm, 2 * cm, 'Open the spec at example.com')
        pdf.linkURL('https://example.com/spec', (2 * cm, 1.8 * cm, 9 * cm, 2.6 * cm), relative=0)
    pdf.setFont('Helvetica', 9)
    pdf.drawString(width / 2, 1.2 * cm, str(number))
    pdf.showPage()
pdf.save()

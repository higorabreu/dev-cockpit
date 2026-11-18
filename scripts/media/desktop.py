# Draws what sits behind the cockpit in the recordings: a plain desktop with an editor-like and a
# browser-like window, and the browser pages the fake xdg-open shows. Generic shapes, no product's look.
# Usage: python3 desktop.py <work dir> [width] [height]
import os
import sys

from PIL import Image, ImageDraw

from fonts import font

WORK = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 1280
H = int(sys.argv[3]) if len(sys.argv) > 3 else 720

DESK = (44, 47, 51)
FRAME = (32, 33, 36)
PANE = (24, 25, 27)
INK = (214, 216, 220)
DIM = (128, 132, 138)
RULE = (52, 54, 58)
PAPER = (246, 246, 244)
PAPER_INK = (40, 40, 40)
PAPER_DIM = (110, 110, 110)


def window(d, box, title):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, 8, fill=FRAME, outline=RULE)
    d.text((x0 + 14, y0 + 8), title, font=font('sans', 12, 500), fill=DIM)
    cy = y0 + 15
    d.line((x1 - 72, cy, x1 - 62, cy), fill=DIM)
    d.rectangle((x1 - 50, cy - 5, x1 - 40, cy + 5), outline=DIM)
    d.line((x1 - 27, cy - 5, x1 - 17, cy + 5), fill=DIM)
    d.line((x1 - 27, cy + 5, x1 - 17, cy - 5), fill=DIM)
    d.line((x0, y0 + 30, x1, y0 + 30), fill=RULE)


def editor(d):
    box = (36, 70, 760, 690)
    window(d, box, 'signup.js · acme-api')
    x0, y0, x1, y1 = box
    d.rectangle((x0 + 1, y0 + 31, x0 + 180, y1 - 1), fill=PANE)
    files = ['acme-api', '  libs', '  src', '    signup.js', '    users.js', '  test', '    signup.test.js', '  package.json', '  README.md']
    for i, name in enumerate(files):
        color = INK if name.strip() == 'signup.js' else DIM
        d.text((x0 + 14, y0 + 44 + i * 22), name, font=font('sans', 12), fill=color)
    code = [
        ("import { findUser, saveUser } from './users.js'", INK),
        ('', INK),
        ('export function signup(body) {', (110, 168, 221)),
        ('  if (findUser(body.email)) {', INK),
        ("    return { status: 409, error: 'Email already registered' }", (226, 176, 85)),
        ('  }', INK),
        ('  const user = saveUser({ email: body.email, password: body.password })', INK),
        ('  return { status: 201, user: { email: user.email } }', INK),
        ('}', INK),
        ('', INK),
        ('export function login(body) {', (110, 168, 221)),
        ('  const user = findUser(body.email)', INK),
        ('  if (!user || user.password !== body.password) {', INK),
        ("    return { status: 401, error: 'Wrong email or password' }", (226, 176, 85)),
        ('  }', INK),
        ('  return { status: 200, user: { email: user.email } }', INK),
        ('}', INK),
        ('', INK),
        ('export function logout(session) {', (110, 168, 221)),
        ('  session.end()', INK),
        ('  return { status: 204 }', INK),
        ('}', INK),
        ('', INK),
        ('export function resetPassword(body) {', (110, 168, 221)),
        ('  const user = findUser(body.email)', INK),
        ('  if (user) user.resetToken = createToken()', INK),
        ('  return { status: 202 }', INK),
        ('}', INK),
    ]
    for i, (line, color) in enumerate(code):
        y = y0 + 48 + i * 21
        d.text((x0 + 196, y), str(i + 1).rjust(2), font=font('mono', 12), fill=DIM)
        d.text((x0 + 230, y), line, font=font('mono', 12), fill=color)


def browser(d, box, address, title):
    x0, y0, x1, y1 = box
    window(d, box, title)
    d.rounded_rectangle((x0 + 12, y0 + 38, x1 - 12, y0 + 62), 6, fill=PANE)
    d.text((x0 + 24, y0 + 43), address, font=font('sans', 12), fill=DIM)
    d.rectangle((x0 + 1, y0 + 70, x1 - 1, y1 - 1), fill=PAPER)
    return x0 + 28, y0 + 92


def docs_page(d):
    x, y = browser(d, (560, 130, 1244, 700), 'docs.example.com/acme/api/sign-up', 'Sign-up API · Acme docs')
    d.text((x, y), 'Sign-up API', font=font('sans', 22, 650), fill=PAPER_INK)
    lines = [
        'POST /signup creates an account from an email and a password.',
        'The email must be a valid address and is stored in lower case.',
        'The password needs at least 12 characters.',
        '',
        'Responses',
        '201  the account was created',
        '400  the email or the password is not valid',
        '409  the email is already registered',
        '',
        'Rate limits',
        'Ten requests a minute for each address; more return 429.',
        'Retry after the time the Retry-After header gives.',
        '',
        'Errors',
        'Every error has a status and a message in English.',
    ]
    for i, line in enumerate(lines):
        bold = line in ('Responses', 'Rate limits', 'Errors')
        d.text((x, y + 44 + i * 24), line, font=font('sans', 14, 600 if bold else 400), fill=PAPER_INK if bold else PAPER_DIM)


def pull_request_page(path):
    img = Image.new('RGB', (1000, 600), DESK)
    d = ImageDraw.Draw(img)
    x, y = browser(d, (0, 0, 999, 599), f'git.example.com/{path}', 'Cache the pricing table for five minutes')
    d.text((x, y), 'Cache the pricing table for five minutes  #208', font=font('sans', 24, 650), fill=PAPER_INK)
    d.rounded_rectangle((x, y + 44, x + 64, y + 68), 12, fill=(46, 125, 80))
    d.text((x + 14, y + 47), 'Open', font=font('sans', 13, 600), fill=(255, 255, 255))
    d.text((x + 78, y + 48), 'bruno wants to merge feat/pr-208 into main', font=font('sans', 14), fill=PAPER_DIM)
    rows = [
        ('×', (196, 53, 43), 'test (node 24)', 'Failed after 1m 12s'),
        ('×', (196, 53, 43), 'This branch has conflicts', 'src/pricing/cache.js'),
        ('✓', (46, 125, 80), 'lint', 'Passed'),
    ]
    top = y + 100
    d.rounded_rectangle((x, top, 940, top + 3 * 44 + 8), 8, outline=(220, 220, 216), fill=(255, 255, 255))
    for i, (mark, color, name, note) in enumerate(rows):
        ry = top + 12 + i * 44
        mx, my = x + 18, ry + 6
        if mark == '×':
            d.line((mx, my, mx + 9, my + 9), fill=color, width=2)
            d.line((mx, my + 9, mx + 9, my), fill=color, width=2)
        else:
            d.line((mx, my + 5, mx + 3, my + 9, mx + 10, my), fill=color, width=2)
        d.text((x + 44, ry), name, font=font('sans', 15, 600), fill=PAPER_INK)
        d.text((x + 44, ry + 20), note, font=font('sans', 12), fill=PAPER_DIM)
    for i in range(4):
        d.rounded_rectangle((x, top + 180 + i * 26, x + 620 - i * 90, top + 192 + i * 26), 4, fill=(226, 226, 222))
    return img


def main():
    os.makedirs(os.path.join(WORK, 'pages'), exist_ok=True)
    img = Image.new('RGB', (W, H), DESK)
    d = ImageDraw.Draw(img)
    editor(d)
    docs_page(d)
    img.save(os.path.join(WORK, 'desktop.png'))
    for path in ['acme/web/pull/208']:
        slug = path.replace('/', '-')
        pull_request_page(path).save(os.path.join(WORK, 'pages', f'{slug}.png'))


main()

# A 50-page PDF of text and headings, a chart every five pages and a photo every ten, for the PDF viewers.
# Needs reportlab. Usage: make-pdf.py <out.pdf> <photo.jpg>
import random
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

WORDS = (
    'cockpit terminal session review branch commit window tab file editor search project agent shell '
    'memory budget frame latency process renderer daemon socket settings theme token palette'
).split()


def paragraph(rng, words):
    return ' '.join(rng.choice(WORDS) for _ in range(words)).capitalize() + '.'


def page(pdf, rng, number):
    width, height = A4
    pdf.setFont('Helvetica-Bold', 16)
    pdf.drawString(2 * cm, height - 2.5 * cm, f'Chapter {number}: {rng.choice(WORDS).title()}')
    text = pdf.beginText(2 * cm, height - 3.5 * cm)
    text.setFont('Times-Roman', 11)
    lines = 50 if number % 5 else 18
    for _ in range(lines):
        text.textLine(paragraph(rng, 14)[:95])
    pdf.drawText(text)
    if number % 5 == 0:
        for bar in range(12):
            pdf.setFillColorRGB(rng.random(), 0.4, 0.7)
            pdf.rect(2 * cm + bar * 1.4 * cm, 3 * cm, 1 * cm, rng.uniform(2, 9) * cm, fill=1)
    if number % 10 == 0:
        pdf.drawImage(sys.argv[2], 2 * cm, 12.5 * cm, width=16 * cm, height=10 * cm)
    pdf.setFont('Helvetica', 9)
    pdf.drawString(width / 2, 1.2 * cm, str(number))
    pdf.showPage()


def main():
    rng = random.Random(7)
    pdf = canvas.Canvas(sys.argv[1], pagesize=A4)
    for number in range(1, 51):
        page(pdf, rng, number)
    pdf.save()


main()

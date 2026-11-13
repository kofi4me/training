import io
import json
import math
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

root = Path(__file__).parent
record = json.load(sys.stdin)
pdfmetrics.registerFont(TTFont('Learner', str(root / 'assets' / 'fonts' / 'Vera.ttf')))
output = io.BytesIO()
c = canvas.Canvas(output, pagesize=(842, 595), pageCompression=1)
c.setTitle('KryptNet Professional Certificate - Network Fundamentals')
c.setAuthor('KryptNet LLC')
navy = (.03, .03, .53)
gold = (.71, .60, .33)
ink = (.13, .23, .21)
muted = (.36, .42, .40)
c.setFillColorRGB(1, 1, 1)
c.rect(0, 0, 842, 595, fill=1, stroke=0)
c.setFillColorRGB(*navy)
c.rect(0, 585, 842, 10, fill=1, stroke=0)
c.rect(0, 0, 842, 10, fill=1, stroke=0)
c.setStrokeColorRGB(*gold)
c.setLineWidth(.8)
c.rect(24, 24, 794, 547)
c.setStrokeColorRGB(.87, .89, .90)
c.rect(30, 30, 782, 535)

def text(value, y, size=12, font='Helvetica', color=ink, x=421, align='center'):
    c.setFillColorRGB(*color)
    c.setFont(font, size)
    draw = c.drawCentredString if align == 'center' else c.drawString
    draw(x, y, str(value))

text('KRYPTNET LLC / LEARNING & DEVELOPMENT', 550, 7, color=muted, x=55, align='left')
c.setFillColorRGB(*muted)
c.setFont('Courier', 7)
c.drawRightString(787, 550, f"Certificate ID: {record['id']}")
c.drawImage(str(root / 'assets' / 'kryptnet-logo.jpg'), 349, 479, 144, 58)

# Fine corner flourishes frame the certificate without competing with its content.
c.setStrokeColorRGB(*gold)
for x, y, direction in [(48, 526, 1), (794, 526, -1)]:
    p = c.beginPath()
    p.moveTo(x, y - 30)
    p.curveTo(x, y, x + direction * 20, y, x + direction * 55, y)
    c.drawPath(p)

text('KryptNet Professional Certificate', 438, 28, 'Times-Roman', navy)
text('CERTIFICATE OF COMPLETION', 413, 10, color=muted)
text('This certifies that', 369, 12, color=muted)
size = 34
while pdfmetrics.stringWidth(record['name'], 'Learner', size) > 690 and size > 8:
    size -= 1
text(record['name'], 325, size, 'Learner', (.59, .03, .03))
text('has successfully completed the course assessment in', 272, 11, color=muted)
text('Network Fundamentals', 240, 23, 'Times-Bold')
text('IPv4 Addressing, VLANs, and Packet Forwarding', 218, 11, color=muted)
c.setStrokeColorRGB(.84, .87, .88)
c.line(65, 189, 777, 189)

date = datetime.fromisoformat(record['date'].replace('Z', '+00:00')).astimezone(timezone(timedelta(hours=-4)))
text('COMPLETION DATE', 160, 7, color=muted, x=70, align='left')
text(date.strftime('%B %d, %Y'), 144, 11, x=70, align='left')
text(f"Assessment score: {record['score']}%", 124, 9, x=70, align='left')

# Decorative completion rosette, not an accreditation or digital-signature seal.
c.saveState()
c.translate(431, 132)
c.setStrokeColorRGB(*gold)
c.setFillColorRGB(.99, .98, .94)
p = c.beginPath()
for i in range(96):
    angle = 2 * math.pi * i / 96
    radius = 34 if i % 2 == 0 else 31
    point = (radius * math.cos(angle), radius * math.sin(angle))
    if i == 0:
        p.moveTo(*point)
    else:
        p.lineTo(*point)
p.close()
c.drawPath(p, fill=1, stroke=1)
c.circle(0, 0, 26, stroke=1, fill=0)
c.setFillColorRGB(*navy)
c.setFont('Times-Bold', 10)
c.drawCentredString(0, -2, 'KryptNet')
c.setFont('Helvetica', 5)
c.drawCentredString(0, -13, 'COMPLETION')
c.restoreState()

c.setStrokeColorRGB(*muted)
c.line(556, 124, 754, 124)
text('Authorized Signatory', 107, 9, color=muted, x=655)
text('KryptNet LLC', 91, 10, 'Times-Italic', x=655)
text('Unsupervised assessment. Learner identity is self-declared. Not an accredited qualification.', 58, 8, color=muted)
text('Compare the certificate ID and PDF with the issuer-held completion record.', 44, 7, color=muted)
c.showPage()
c.save()
sys.stdout.buffer.write(output.getvalue())

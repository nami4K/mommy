import sys, pypdfium2 as pdfium
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
pdf = pdfium.PdfDocument(src); n = len(pdf)
W, H, C = 96, 138, 18
rows = (n + C - 1) // C
sheet = Image.new('RGB', (C * W, rows * (H + 14)), 'white'); d = ImageDraw.Draw(sheet)
for i in range(n):
    im = pdf[i].render(scale=0.25).to_pil().convert('RGB').resize((W - 4, H - 4))
    x, y = (i % C) * W, (i // C) * (H + 14)
    sheet.paste(im, (x + 2, y + 14)); d.text((x + 3, y + 1), str(i + 1), fill='red')
sheet.save(out, quality=80)
print(sheet.size)

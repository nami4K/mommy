import sys, os, pypdfium2 as pdfium
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
pdf = pdfium.PdfDocument(src)
for i in range(len(pdf)):
    p = os.path.join(out, f"p{i+1:03d}.jpg")
    if os.path.exists(p): continue
    im = pdf[i].render(scale=2.0).to_pil().convert('RGB')
    im.save(p, 'JPEG', quality=72, optimize=True)
print(src, len(pdf))

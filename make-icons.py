"""Génère les icônes BoutiquePro (PWA + Google Play). Usage : python3 tools/make-icons.py"""
from PIL import Image, ImageDraw
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)
S = 1024  # dessin haute résolution

def gradient(size):
    img = Image.new('RGB', (size, size))
    px = img.load()
    a, b = (13, 148, 136), (20, 184, 166)  # teal
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size)
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return img

def shop(d, k, ox, oy):
    """Dessine une boutique blanche ; k = échelle, (ox, oy) = origine."""
    W = lambda v: int(v * k)
    X = lambda v: ox + W(v)
    Y = lambda v: oy + W(v)
    white, teal, amber = (255, 255, 255), (15, 118, 110), (245, 158, 11)
    # corps
    d.rounded_rectangle([X(170), Y(430), X(854), Y(840)], radius=W(36), fill=white)
    # auvent rayé
    stripes = 6
    w = (854 - 170) / stripes
    for i in range(stripes):
        col = amber if i % 2 == 0 else white
        x0 = X(170 + i * w); x1 = X(170 + (i + 1) * w)
        d.polygon([(x0, Y(250)), (x1, Y(250)), (x1, Y(450)), (x0, Y(450))], fill=col)
    d.rounded_rectangle([X(150), Y(210), X(874), Y(290)], radius=W(30), fill=amber)
    # porte et vitrine
    d.rounded_rectangle([X(250), Y(560), X(440), Y(840)], radius=W(22), fill=teal)
    d.rounded_rectangle([X(520), Y(540), X(774), Y(720)], radius=W(22), fill=(204, 251, 241))
    d.ellipse([X(395), Y(690), X(420), Y(715)], fill=white)

def make(name, size, maskable=False, rounded=True):
    bg = gradient(S)
    if rounded and not maskable:
        m = Image.new('L', (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=255)
        base = Image.new('RGBA', (S, S), (0, 0, 0, 0)); base.paste(bg, (0, 0), m)
    else:
        base = bg.convert('RGBA')
    d = ImageDraw.Draw(base)
    k = 0.62 if maskable else 1.0          # zone de sécurité pour les icônes adaptatives
    off = (S - S * k) / 2
    shop(d, k, int(off), int(off))
    base.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))

make('icon-192.png', 192)
make('icon-512.png', 512)
make('maskable-512.png', 512, maskable=True)
make('apple-touch-icon.png', 180, rounded=False)   # iOS arrondit lui-même
make('favicon-32.png', 32)
make('play-store-512.png', 512, rounded=False)     # fiche Play Store : carré plein, 512×512
print('Icônes créées dans', os.path.abspath(OUT))

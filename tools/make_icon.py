"""python tools/make_icon.py — иконка приложения.

Замысел: одна красная линия маршрута с круглыми точками, которая по дороге
складывается в силуэт машины. Не картинка машины и не отдельный маршрут —
именно маршрут, ставший машиной.

Рисуем вчетверо крупнее и уменьшаем: края выходят гладкими без ручного
сглаживания. Всё держим в центральных ~76 %, чтобы iOS могла скруглить углы,
ничего не срезав.
"""
from PIL import Image, ImageDraw
import os

S, K = 1024, 4                 # итог и коэффициент передискретизации
BG   = (255, 255, 255)
RED  = (214, 32, 39)

W = S * K
img = Image.new('RGB', (W, W), BG)
d = ImageDraw.Draw(img)

px = lambda p: (int(p[0] * W), int(p[1] * W))
stroke = int(0.060 * W)

def dot(p, r, fill=RED):
    x, y = px(p); r = int(r * W)
    d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

# ── Линия маршрута: одна горизонталь с точками на концах.
#    На ней же стоит машина — низ силуэта и есть эта линия.
BASE = 0.600
d.line([px((0.120, BASE)), px((0.880, BASE))], fill=RED, width=stroke)

# ── Замкнутый силуэт: корма, багажник, крыша, капот, нос.
#    Салон занимает около трети длины — узкий читается как палатка.
body = [(0.166, BASE), (0.202, 0.442), (0.332, 0.418), (0.398, 0.232),
        (0.614, 0.232), (0.680, 0.418), (0.826, 0.442), (0.860, BASE)]
d.line([px(p) for p in body], fill=RED, width=stroke, joint='curve')
for p in body:
    dot(p, stroke / (2 * W))

# ── Колёса: линия проходит за ними, поэтому вырезаем её ровно по ободу
for c in [(0.345, 0.648), (0.681, 0.648)]:
    dot(c, 0.118, BG)
    dot(c, 0.118, RED)
    dot(c, 0.057, BG)

# ── Точки маршрута на концах
dot((0.120, BASE), 0.047)
dot((0.880, BASE), 0.047)

img = img.resize((S, S), Image.LANCZOS)

root = os.path.join(os.path.dirname(__file__), '..')
img.save(os.path.join(root, 'icon.png'))
os.makedirs(os.path.join(root, 'native'), exist_ok=True)
img.save(os.path.join(root, 'native', 'icon-1024.png'))
img.resize((60, 60), Image.LANCZOS).save(os.path.join(root, 'icon-60.png'))
print('icon.png, native/icon-1024.png, icon-60.png готовы')

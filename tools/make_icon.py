"""python tools/make_icon.py — иконка приложения.

Замысел: маршрут из трёх точек, идущий вверх. Ничего лишнего — на домашнем
экране иконка живёт размером с ноготь, и любая деталь там превращается в грязь.
Рисуем вчетверо крупнее и уменьшаем: так края выходят гладкими без сглаживания
вручную. Содержимое держим в центральных 70 %, чтобы iOS могла обрезать углы,
ничего не срезав.
"""
from PIL import Image, ImageDraw
import os

S = 1024          # итоговый размер
K = 4             # во сколько раз рисуем крупнее
BG   = (11, 11, 11)
INK  = (255, 255, 255)

W = S * K
img = Image.new('RGB', (W, W), BG)
d = ImageDraw.Draw(img)

# Путь с изломом: прямая читалась как гантель, а не как маршрут.
# Начало — кольцо (дом), конец — сплошная точка (куда едем).
pts = [(0.27, 0.76), (0.45, 0.39), (0.74, 0.30)]
pts = [(int(x * W), int(y * W)) for x, y in pts]

line = int(0.048 * W)
d.line(pts, fill=INK, width=line, joint='curve')
for x, y in pts[1:-1]:                          # закругляем сам излом
    r = line // 2
    d.ellipse([x - r, y - r, x + r, y + r], fill=INK)

# дом — кольцо
x, y = pts[0]; r = int(0.072 * W)
d.ellipse([x - r, y - r, x + r, y + r], fill=INK)
h = int(r * 0.46)
d.ellipse([x - h, y - h, x + h, y + h], fill=BG)

# цель — сплошная точка
x, y = pts[-1]; r = int(0.062 * W)
d.ellipse([x - r, y - r, x + r, y + r], fill=INK)

img = img.resize((S, S), Image.LANCZOS)

root = os.path.join(os.path.dirname(__file__), '..')
img.save(os.path.join(root, 'icon.png'))
os.makedirs(os.path.join(root, 'native'), exist_ok=True)
img.save(os.path.join(root, 'native', 'icon-1024.png'))

# маленькая проверка: иконка обязана читаться и в 60 пикселей
img.resize((60, 60), Image.LANCZOS).save(os.path.join(root, 'icon-60.png'))
print('icon.png, native/icon-1024.png, icon-60.png готовы')

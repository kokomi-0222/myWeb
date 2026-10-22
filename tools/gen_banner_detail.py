"""生成帖子详情页横幅的分层占位素材（10 层，统一 2880x320 透明 PNG）。

设计：黄昏海边 + 灯塔，扁平插画风，配色贴合站点（粉 #fb7299 / 蓝 #00aeec）。
所有层使用同一画布坐标，只有画面部分不透明，左右各留约 8% 出血余量。
"""

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter

W, H = 3200, 320          # 输出尺寸，宽高比 10:1，兼顾 1440 与 1920 视口的 cover 裁切
S = 3                     # 超采样倍数，用来给多边形做抗锯齿
CW, CH = W * S, H * S
RATIO = CW / CH

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "vue", "src", "assets", "images", "banner-detail",
)

SKY_TOP = (253, 247, 251)
SKY_MID = (243, 207, 223)
SKY_LOW = (206, 138, 176)
SKY_PINK = (172, 110, 158)
SKY_WARM = (234, 146, 148)
SKY_HORIZON = (255, 212, 162)

INK = (28, 22, 48)        # 最前景剪影
TREE = (34, 27, 58)
ROCK = (30, 24, 52)
FAR_LAND = (114, 90, 150)
MID_LAND = (86, 68, 122)
SEA_TOP = (142, 114, 174)
SEA_BOTTOM = (58, 47, 88)


def new():
    return Image.new("RGBA", (CW, CH), (0, 0, 0, 0))


def lerp(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def color_at(stops, t):
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        if p0 <= t <= p1:
            k = (t - p0) / (p1 - p0) if p1 > p0 else 0.0
            return lerp(c0, c1, k)
    return stops[-1][1]


def band(img, v0, v1, stops, alpha=255):
    """在 v0..v1 的竖直范围内铺渐变。"""
    d = ImageDraw.Draw(img)
    y0, y1 = int(v0 * CH), int(v1 * CH)
    span = max(y1 - y0, 1)
    for y in range(y0, y1):
        c = color_at(stops, (y - y0) / span)
        d.line([(0, y), (CW, y)], fill=c + (alpha,))
    return img


def pg(d, pts, fill):
    d.polygon([(x * CW, y * CH) for x, y in pts], fill=fill)


def ell(d, u, v, ru, rv, fill):
    d.ellipse(
        [(u - ru) * CW, (v - rv) * CH, (u + ru) * CW, (v + rv) * CH],
        fill=fill,
    )


def circ(d, u, v, rv, fill):
    ell(d, u, v, rv / RATIO, rv, fill)


def line_px(d, pts, fill, width):
    d.line(pts, fill=fill, width=int(width), joint="curve")


def hline(d, u0, u1, v, fill, wv):
    d.line(
        [(u0 * CW, v * CH), (u1 * CW, v * CH)],
        fill=fill,
        width=max(1, int(wv * CH)),
    )


def cloud(d, u, v, w, h, fill):
    parts = [
        (0.00, 0.00, 1.00, 1.00),
        (-0.30, 0.10, 0.58, 0.80),
        (0.26, 0.06, 0.56, 0.78),
        (-0.56, 0.24, 0.36, 0.54),
        (0.52, 0.22, 0.34, 0.52),
        (0.04, -0.18, 0.52, 0.72),
    ]
    for ox, oy, ew, eh in parts:
        ell(d, u + ox * w, v + oy * h, ew * w / 2, eh * h / 2, fill)


def frond(d, u, v, ang, length, droop, fill):
    """棕榈叶：沿弧线两侧偏移出尖叶轮廓。"""
    n = 14
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        a = math.radians(ang + droop * t * t)
        px = length * CW * t
        x = u * CW + math.cos(a) * px
        y = v * CH + math.sin(a) * px
        hw = 0.026 * CH * (1 - t) ** 0.5 * (0.55 + 0.45 * math.sin(math.pi * min(t * 1.6, 1)))
        nx, ny = -math.sin(a), math.cos(a)
        left.append((x + nx * hw, y + ny * hw))
        right.append((x - nx * hw, y - ny * hw))
    d.polygon(left + right[::-1], fill=fill)


def finish(img, name):
    out = img.resize((W, H), Image.LANCZOS)
    path = os.path.join(OUT, name)
    out.save(path, optimize=True)
    kb = os.path.getsize(path) / 1024
    print(f"  {name:18s} {kb:7.1f} KB")


def layer_sky():
    img = band(img := new(), 0.0, 1.0, [
        (0.00, SKY_TOP),
        (0.24, SKY_MID),
        (0.48, SKY_LOW),
        (0.66, SKY_PINK),
        (0.82, SKY_WARM),
        (1.00, SKY_HORIZON),
    ])
    d = ImageDraw.Draw(img)
    for bu, bv, sc in [(0.215, 0.165, 0.011), (0.268, 0.118, 0.0085), (0.325, 0.185, 0.0072),
                       (0.392, 0.135, 0.0062)]:
        w = sc * CW
        p = int(0.0022 * CH) + 1
        d.line([(bu * CW - w, bv * CH), (bu * CW, bv * CH + w * 0.34)], fill=(126, 92, 128, 175), width=p)
        d.line([(bu * CW, bv * CH + w * 0.34), (bu * CW + w, bv * CH)], fill=(126, 92, 128, 175), width=p)
    return img


def layer_clouds():
    img = new()
    d = ImageDraw.Draw(img)
    random.seed(21)
    specs = [
        (0.09, 0.26, 0.15, 0.22, (255, 250, 253, 155)),
        (0.26, 0.14, 0.12, 0.17, (255, 253, 254, 110)),
        (0.47, 0.33, 0.17, 0.20, (196, 148, 186, 74)),
        (0.70, 0.20, 0.14, 0.18, (255, 246, 238, 125)),
        (0.90, 0.34, 0.15, 0.19, (188, 140, 178, 68)),
        (0.03, 0.42, 0.12, 0.16, (202, 156, 192, 46)),
    ]
    for s in specs:
        cloud(d, *s)
    return img


def layer_far_land():
    img = new()
    d = ImageDraw.Draw(img)
    d.polygon(
        [
            (0.00 * CW, 0.86 * CH),
            (0.06 * CW, 0.70 * CH),
            (0.13 * CW, 0.62 * CH),
            (0.19 * CW, 0.69 * CH),
            (0.25 * CW, 0.58 * CH),
            (0.31 * CW, 0.66 * CH),
            (0.38 * CW, 0.60 * CH),
            (0.45 * CW, 0.72 * CH),
            (0.52 * CW, 0.78 * CH),
            (0.60 * CW, 0.74 * CH),
            (0.68 * CW, 0.79 * CH),
            (0.77 * CW, 0.73 * CH),
            (0.85 * CW, 0.79 * CH),
            (0.92 * CW, 0.75 * CH),
            (1.00 * CW, 0.82 * CH),
            (1.00 * CW, 0.98 * CH),
            (0.00 * CW, 0.98 * CH),
        ],
        fill=FAR_LAND + (238,),
    )
    for u, v, w in [(0.14, 0.66, 0.02), (0.27, 0.62, 0.015), (0.40, 0.65, 0.018), (0.80, 0.77, 0.02)]:
        pg(d, [(u - w, v + 0.06), (u, v), (u + w, v + 0.06)], (108, 90, 156, 160))
    return img


def layer_mid_land():
    img = new()
    d = ImageDraw.Draw(img)
    pg(d, [
        (0.06, 0.94), (0.10, 0.78), (0.15, 0.70), (0.21, 0.75),
        (0.27, 0.66), (0.33, 0.74), (0.40, 0.80), (0.42, 0.94),
    ], MID_LAND + (255,))
    pg(d, [
        (0.56, 0.94), (0.58, 0.80), (0.62, 0.76), (0.68, 0.74),
        (0.74, 0.79), (0.79, 0.76), (0.84, 0.83), (0.86, 0.94),
    ], MID_LAND + (255,))
    pg(d, [
        (0.855, 0.94), (0.87, 0.86), (0.90, 0.84), (0.93, 0.88),
        (0.95, 0.94),
    ], MID_LAND + (240,))

    pg(d, [(0.545, 0.795), (0.545, 0.705), (0.568, 0.690), (0.592, 0.702), (0.592, 0.795)], (44, 35, 72, 255))
    pg(d, [(0.540, 0.706), (0.568, 0.672), (0.597, 0.703)], (34, 26, 58, 255))
    for u in (0.556, 0.578):
        ell(d, u, 0.745, 0.0045, 0.016, (255, 206, 138, 235))

    pg(d, [(0.600, 0.800), (0.628, 0.812), (0.700, 0.818), (0.700, 0.826), (0.626, 0.822), (0.598, 0.812)],
       (46, 37, 74, 255))
    for u in (0.632, 0.650, 0.668, 0.686):
        pg(d, [(u, 0.818), (u + 0.006, 0.818), (u + 0.006, 0.842), (u, 0.842)], (30, 23, 52, 255))
    return img


def layer_lighthouse():
    img = new()
    d = ImageDraw.Draw(img)
    u = 0.628
    top_v, bot_v = 0.335, 0.800
    w_bot, w_top = 0.0235, 0.0140

    def w_at(v):
        t = (bot_v - v) / (bot_v - top_v)
        return w_bot + (w_top - w_bot) * t

    pg(d, [
        (u - w_bot, bot_v), (u + w_bot, bot_v),
        (u + w_top, top_v), (u - w_top, top_v),
    ], (252, 249, 255, 255))

    for v0, v1 in [(0.455, 0.495), (0.575, 0.615), (0.695, 0.735)]:
        pg(d, [
            (u - w_at(v0), v0), (u + w_at(v0), v0),
            (u + w_at(v1), v1), (u - w_at(v1), v1),
        ], (250, 92, 138, 255))

    base_v = top_v - 0.052
    pg(d, [
        (u - w_top * 1.55, top_v), (u + w_top * 1.55, top_v),
        (u + w_top * 1.45, base_v), (u - w_top * 1.45, base_v),
    ], (56, 46, 88, 255))
    pg(d, [
        (u - w_top * 0.95, top_v - 0.012), (u + w_top * 0.95, top_v - 0.012),
        (u + w_top * 0.95, base_v + 0.014), (u - w_top * 0.95, base_v + 0.014),
    ], (255, 228, 154, 255))
    pg(d, [
        (u - w_top * 2.0, base_v), (u + w_top * 2.0, base_v),
        (u, base_v - 0.055),
    ], (44, 36, 72, 255))
    circ(d, u, base_v - 0.068, 0.012, (56, 46, 88, 255))

    pg(d, [(u - w_bot * 1.35, bot_v), (u + w_bot * 1.35, bot_v),
           (u + w_bot * 1.15, bot_v + 0.02), (u - w_bot * 1.15, bot_v + 0.02)], (58, 48, 90, 255))

    bu, bv = 0.352, 0.815
    pg(d, [(bu - 0.016, bv), (bu + 0.016, bv), (bu + 0.011, bv + 0.026), (bu - 0.011, bv + 0.026)],
       (30, 23, 50, 255))
    pg(d, [(bu - 0.001, bv - 0.002), (bu - 0.001, bv - 0.070), (bu + 0.020, bv - 0.004)],
       (34, 26, 56, 255))
    pg(d, [(bu + 0.003, bv - 0.006), (bu + 0.003, bv - 0.048), (bu - 0.014, bv - 0.006)],
       (26, 20, 44, 255))
    return img


def layer_sea():
    img = new()
    band(img, 0.775, 1.0, [(0.0, SEA_TOP), (0.55, (82, 67, 124)), (1.0, SEA_BOTTOM)])
    d = ImageDraw.Draw(img)
    random.seed(11)
    horizon = 0.775
    hline(d, 0.0, 1.0, horizon, (255, 224, 196, 120), 0.008)
    hline(d, 0.0, 1.0, horizon + 0.014, (255, 196, 200, 60), 0.014)
    for _ in range(260):
        v = horizon + (random.random() ** 1.4) * 0.225
        u = random.uniform(0.01, 0.99)
        length = (0.004 + (v - horizon) * 0.075) * random.uniform(0.5, 1.8)
        a = int(210 * max(0.0, 1 - (v - horizon) / 0.26))
        if a < 14:
            continue
        hline(d, u, u + length, v, (255, 228, 194, a), 0.0018 + (v - horizon) * 0.008)
    for _ in range(110):
        v = horizon + (random.random() ** 1.8) * 0.20
        u = 0.628 + random.uniform(-0.09, 0.09) * (1 - (v - horizon) / 0.26)
        length = (0.004 + (v - horizon) * 0.05) * random.uniform(0.6, 2.0)
        hline(d, u, u + length, v, (255, 242, 208, 170), 0.0022)
    return img


def layer_glow():
    img = new()
    d = ImageDraw.Draw(img)
    circ(d, 0.628, 0.300, 0.085, (255, 226, 160, 70))
    circ(d, 0.628, 0.300, 0.040, (255, 240, 200, 90))
    pg(d, [(0.628, 0.300), (0.86, 0.02), (0.92, 0.10), (0.66, 0.345)], (255, 236, 180, 44))
    pg(d, [(0.628, 0.300), (0.38, 0.02), (0.32, 0.10), (0.59, 0.345)], (255, 236, 180, 34))
    circ(d, 0.660, 0.790, 0.145, (255, 214, 168, 42))
    circ(d, 0.660, 0.790, 0.060, (255, 236, 200, 56))
    return img.filter(ImageFilter.GaussianBlur(radius=int(0.016 * CH)))


def layer_tree_left():
    img = new()
    d = ImageDraw.Draw(img)
    trunk = [
        (0.060 * CW, 1.06 * CH),
        (0.070 * CW, 0.90 * CH),
        (0.080 * CW, 0.74 * CH),
        (0.088 * CW, 0.58 * CH),
        (0.093 * CW, 0.44 * CH),
        (0.096 * CW, 0.30 * CH),
    ]
    line_px(d, trunk, TREE + (255,), 0.038 * CH)
    for ang, ln, dr in [
        (-168, 0.085, 30), (-142, 0.098, 44), (-108, 0.102, 54),
        (-58, 0.100, 48), (-24, 0.082, 30),
    ]:
        frond(d, 0.096, 0.295, ang, ln, dr, TREE + (255,))
    pg(d, [
        (-0.02, 1.05), (0.01, 0.90), (0.04, 0.94), (0.07, 0.975),
        (0.10, 0.955), (0.13, 1.0), (0.15, 1.05),
    ], TREE + (255,))
    return img


def layer_rock_right():
    img = new()
    d = ImageDraw.Draw(img)
    pg(d, [
        (0.900, 1.05), (0.912, 0.845), (0.932, 0.760), (0.946, 0.792),
        (0.962, 0.722), (0.978, 0.775), (0.992, 0.836), (1.02, 1.05),
    ], ROCK + (255,))
    pg(d, [
        (0.845, 1.05), (0.858, 0.905), (0.878, 0.850), (0.895, 0.905), (0.905, 1.05),
    ], ROCK + (255,))
    for ang, ln in [(-78, 0.055), (-40, 0.048), (-118, 0.048)]:
        frond(d, 0.946, 0.735, ang, ln, 22, ROCK + (255,))
    for ang, ln in [(-84, 0.040), (-46, 0.036)]:
        frond(d, 0.878, 0.855, ang, ln, 20, ROCK + (255,))
    return img


def layer_foreground():
    img = new()
    d = ImageDraw.Draw(img)
    random.seed(33)
    for _ in range(74):
        u = random.uniform(-0.02, 1.02)
        edge = min(abs(u - 0.5) * 2, 1.0)
        hgt = random.uniform(0.055, 0.115) * (0.55 + 0.75 * edge) * (0.65 + random.random() * 0.7)
        wd = random.uniform(0.0018, 0.0046)
        pg(d, [(u - wd, 1.00), (u + wd * 0.28, 1.00 - hgt), (u + wd, 1.00)], INK + (255,))

    petals = [(251, 114, 153), (0, 174, 236), (255, 246, 250), (255, 208, 120)]
    random.seed(44)
    for _ in range(18):
        side = random.random()
        u = random.uniform(0.03, 0.22) if side < 0.45 else random.uniform(0.78, 0.99)
        v = random.uniform(0.872, 0.932)
        c = random.choice(petals)
        r = random.uniform(0.013, 0.019)
        for k in range(5):
            a = k * math.pi / 2.4
            circ(d, u + math.cos(a) * r / RATIO * 1.1, v + math.sin(a) * r * 0.8, r * 0.62, c + (240,))
        circ(d, u, v, r * 0.36, (255, 232, 168, 245))

    pg(d, [
        (-0.02, 1.05), (0.05, 0.988), (0.12, 0.996), (0.20, 0.985),
        (0.30, 1.000), (0.40, 0.990), (0.50, 1.002), (0.60, 0.990),
        (0.70, 1.000), (0.80, 0.987), (0.90, 0.999), (1.02, 0.989),
        (1.02, 1.08), (-0.02, 1.08),
    ], (12, 9, 22, 255))
    return img


LAYERS = [
    ("layer01.png", layer_sky),
    ("layer02.png", layer_clouds),
    ("layer03.png", layer_far_land),
    ("layer04.png", layer_mid_land),
    ("layer05.png", layer_lighthouse),
    ("layer06.png", layer_sea),
    ("layer07.png", layer_glow),
    ("layer08.png", layer_tree_left),
    ("layer09.png", layer_rock_right),
    ("layer10.png", layer_foreground),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    print(f"输出目录: {OUT}")
    total = 0
    for name, fn in LAYERS:
        img = fn()
        path = os.path.join(OUT, name)
        out = img.resize((W, H), Image.LANCZOS)
        out.save(path, optimize=True)
        kb = os.path.getsize(path) / 1024
        total += kb
        print(f"  {name:14s} {kb:7.1f} KB")
    print(f"  合计 {total / 1024:.2f} MB")


if __name__ == "__main__":
    main()

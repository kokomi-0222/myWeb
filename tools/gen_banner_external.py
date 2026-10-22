"""
用 Kenney.nl 的 Background Elements（CC0）拼一套 10:1 详情页横幅分层图。

素材：tools/ext-assets/kenney/PNG/Flat/*.png
许可：CC0 1.0，可商用，署名非强制（Kenney / www.kenney.nl）

关键手法：所有元素统一转成同色系剪影 + 保留原 alpha，
这样「拿别人的图拼」也不会出现色调打架的脏感。
"""
import os
from PIL import Image, ImageDraw, ImageFilter

SRC = os.path.join(os.path.dirname(__file__), "ext-assets", "kenney", "PNG", "Flat")
OUT = os.path.join(os.path.dirname(__file__), "..", "shots", "ext-banner")

W, H = 3200, 320
S = 2  # 超采样

# ---------- 晚霞配色（与站点 #fb7299 调性一致） ----------
SKY = [
    (0.00, (252, 244, 250)),
    (0.20, (250, 232, 243)),
    (0.42, (244, 210, 226)),
    (0.62, (248, 194, 190)),
    (0.78, (253, 208, 172)),
    (0.90, (255, 222, 182)),
    (1.00, (255, 236, 206)),
]
FAR_HILL = (206, 182, 214)
MID_HILL = (176, 148, 192)
CASTLE = (132, 104, 160)
MID_TREE = (108, 82, 138)
NEAR_TREE = (54, 38, 80)
GROUND = (44, 31, 66)
GRASS = (26, 18, 42)


def lerp(c1, c2, t):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3))


def color_at(stops, t):
    t = max(0.0, min(1.0, t))
    for i in range(len(stops) - 1):
        t0, c0 = stops[i]
        t1, c1 = stops[i + 1]
        if t0 <= t <= t1:
            k = 0 if t1 == t0 else (t - t0) / (t1 - t0)
            return lerp(c0, c1, k)
    return stops[-1][1]


def new():
    return Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))


def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def tint(im, color, alpha=255, keep_shade=0.22):
    """转成指定颜色的剪影，保留原图明暗做微弱层次，避免完全死板。"""
    gray = im.convert("L")
    base = Image.new("RGBA", im.size, color + (0,))
    if keep_shade > 0:
        shade = gray.point(lambda v: int(255 * (1 - keep_shade + keep_shade * v / 255)))
        rgb = Image.new("RGB", im.size, color)
        base = Image.merge("RGBA", (*rgb.split(), shade))
        base.putalpha(Image.composite(shade, Image.new("L", im.size, 0), im.split()[3]))
    a = im.split()[3]
    if alpha < 255:
        a = a.point(lambda v: int(v * alpha / 255))
    base.putalpha(a)
    return base


def paste_at(canvas, im, x, y, alpha=255):
    if alpha < 255:
        a = im.split()[3].point(lambda v: int(v * alpha / 255))
        im = im.copy()
        im.putalpha(a)
    canvas.alpha_composite(im, (int(x), int(y)))


def fit_w(im, width):
    h = max(1, int(round(im.height * width / im.width)))
    return im.resize((int(width), h), Image.LANCZOS)


def fit_h(im, height):
    w = max(1, int(round(im.width * height / im.height)))
    return im.resize((int(w), int(height)), Image.LANCZOS)


def squash(im, width, height):
    """横带素材放进 10:1 画幅必须压扁，剪影下不明显。"""
    return im.resize((int(width), int(height)), Image.LANCZOS)


def finish(img, name):
    os.makedirs(OUT, exist_ok=True)
    out = img.resize((W, H), Image.LANCZOS)
    path = os.path.join(OUT, name)
    out.save(path, optimize=True)
    return path


# ---------------- 各层 ----------------

def layer_sky():
    img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    for y in range(H * S):
        c = color_at(SKY, y / (H * S - 1))
        d.line([(0, y), (W * S, y)], fill=c + (255,))

    # 地平线暖光
    glow = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cy = int(H * S * 0.74)
    for i in range(70):
        t = i / 70
        r = int((1 - t) * W * S * 0.62)
        a = int(20 * (1 - t))
        gd.ellipse([W * S // 2 - r, cy - r // 3, W * S // 2 + r, cy + r // 3], fill=(255, 240, 206, a))
    glow = glow.filter(ImageFilter.GaussianBlur(26 * S))
    img.alpha_composite(glow)

    # 落日：整幅画面的光源锚点，没有它剪影会显得空
    sun = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sun)
    cx, cy, r = W * S * 0.605, H * S * 0.745, H * S * 0.052
    for k in range(26):
        t = k / 26
        rr = r * (1 + t * 7)
        a = int(11 * (1 - t) ** 1.6)
        sd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 238, 196, a))
    sun = sun.filter(ImageFilter.GaussianBlur(10 * S))
    img.alpha_composite(sun)
    d2 = ImageDraw.Draw(img)
    d2.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 247, 224, 250))
    d2.ellipse([cx - r * 0.82, cy - r * 0.82, cx + r * 0.82, cy + r * 0.82], fill=(255, 252, 238, 255))
    return img


def layer_clouds_far():
    """高层极淡的云幕，只负责让天空不空。"""
    img = new()
    band = squash(load("clouds2.png"), W * S * 1.12, H * S * 0.34)
    paste_at(img, tint(band, (255, 253, 255), alpha=74, keep_shade=0.0), -W * S * 0.05, H * S * 0.03)
    band2 = squash(load("clouds1.png"), W * S * 0.78, H * S * 0.22)
    paste_at(img, tint(band2, (255, 250, 253), alpha=58, keep_shade=0.0), W * S * 0.34, H * S * 0.13)
    return img


def layer_clouds_near():
    """几朵实体云，位置错开，避免平铺重复感。"""
    img = new()
    specs = [
        ("cloud6.png", 0.045, 0.075, 0.60, 205),
        ("cloud4.png", 0.285, 0.020, 0.48, 190),
        ("cloud7.png", 0.520, 0.115, 0.56, 178),
        ("cloud2.png", 0.735, 0.045, 0.44, 200),
        ("cloud5.png", 0.205, 0.245, 0.32, 130),
        ("cloud3.png", 0.900, 0.180, 0.30, 120),
    ]
    for name, u, v, sc, a in specs:
        im = load(name)
        im = fit_w(im, im.width * sc * S)
        paste_at(img, tint(im, (255, 251, 253), alpha=a, keep_shade=0.0), u * W * S, v * H * S)
    return img


def layer_far_mountains():
    img = new()
    band = squash(load("pointy_mountains.png"), W * S * 1.16, H * S * 0.30)
    paste_at(img, tint(band, FAR_HILL, alpha=225), -W * S * 0.08, H * S * 0.50)

    # 山脚雾带：空气透视，把远山从「贴纸」变成「远处的山」
    fog = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fog)
    fy = H * S * 0.775
    for i in range(46):
        t = i / 46
        a = int(52 * (1 - t))
        fd.rectangle([0, fy - (1 - t) * H * S * 0.075, W * S, fy + (1 - t) * H * S * 0.012],
                     fill=(255, 226, 232, a))
    fog = fog.filter(ImageFilter.GaussianBlur(14 * S))
    img.alpha_composite(fog)
    return img


def layer_hills():
    img = new()
    band = squash(load("hills2.png"), W * S * 1.22, H * S * 0.22)
    paste_at(img, tint(band, MID_HILL, alpha=240), -W * S * 0.11, H * S * 0.635)
    band2 = squash(load("hills1.png"), W * S * 0.92, H * S * 0.16)
    paste_at(img, tint(band2, MID_HILL, alpha=248), W * S * 0.10, H * S * 0.705)
    return img


def layer_castle():
    img = new()
    base = H * S * 0.848
    castle = fit_h(load("castle.png"), 0.40 * H * S)
    paste_at(img, tint(castle, CASTLE, alpha=252), W * S * 0.545, base - castle.height)
    tower = fit_h(load("tower.png"), 0.34 * H * S)
    paste_at(img, tint(tower, CASTLE, alpha=252), W * S * 0.500, base - tower.height)
    tower2 = fit_h(load("tower.png"), 0.26 * H * S)
    paste_at(img, tint(tower2, CASTLE, alpha=252), W * S * 0.672, base - tower2.height)
    return img


def layer_ground():
    """实心地面：让后面的树和草原踩在地上，而不是浮空。"""
    img = new()
    d = ImageDraw.Draw(img)
    top = H * S * 0.845
    for y in range(int(top), H * S):
        t = (y - top) / max(1, (H * S - top))
        c = lerp(GROUND, (34, 24, 52), t)
        d.line([(0, y), (W * S, y)], fill=c + (255,))

    # 地面起伏上沿
    wave = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wave)
    pts = []
    import math
    for i in range(0, W * S + 20, 20):
        u = i / (W * S)
        v = 0.845 + 0.010 * math.sin(u * 5.1) + 0.006 * math.sin(u * 13.7 + 1.2)
        pts.append((i, v * H * S))
    wd.polygon(pts + [(W * S, H * S), (0, H * S)], fill=GROUND + (255,))
    img.alpha_composite(wave)

    # 地面上的小树剪影，区分远近
    specs = [
        ("tree07.png", 0.095, 0.150), ("tree02.png", 0.175, 0.112),
        ("tree09.png", 0.255, 0.128), ("tree04.png", 0.330, 0.100),
        ("tree12.png", 0.712, 0.118), ("tree03.png", 0.768, 0.094),
        ("tree06.png", 0.828, 0.110), ("tree01.png", 0.892, 0.132),
    ]
    for name, u, hfrac in specs:
        im = fit_h(load(name), hfrac * H * S)
        paste_at(img, tint(im, MID_TREE, alpha=250), u * W * S, H * S * 0.842 - im.height)
    return img


def layer_near_tree_left():
    img = new()
    t = fit_h(load("tree11.png"), 0.86 * H * S)
    paste_at(img, tint(t, NEAR_TREE, alpha=255), -0.010 * W * S, H * S - t.height + 0.01 * H * S)
    t2 = fit_h(load("tree05.png"), 0.44 * H * S)
    paste_at(img, tint(t2, NEAR_TREE, alpha=255), 0.072 * W * S, H * S - t2.height + 0.014 * H * S)
    t3 = fit_h(load("tree09.png"), 0.30 * H * S)
    paste_at(img, tint(t3, NEAR_TREE, alpha=250), 0.030 * W * S, H * S - t3.height + 0.02 * H * S)
    return img


def layer_near_tree_right():
    img = new()
    t = fit_h(load("tree08.png"), 0.74 * H * S)
    paste_at(img, tint(t, NEAR_TREE, alpha=255), W * S - t.width + 0.004 * W * S, H * S - t.height + 0.012 * H * S)
    t2 = fit_h(load("tree10.png"), 0.40 * H * S)
    paste_at(img, tint(t2, NEAR_TREE, alpha=255), W * S - t2.width - 0.062 * W * S, H * S - t2.height + 0.016 * H * S)
    t3 = fit_h(load("tree03.png"), 0.26 * H * S)
    paste_at(img, tint(t3, NEAR_TREE, alpha=248), W * S - t3.width - 0.030 * W * S, H * S - t3.height + 0.022 * H * S)
    return img


def layer_grass():
    img = new()
    specs = [
        ("grass1.png", 0.015, 30), ("grass2.png", 0.052, 36),
        ("grass1.png", 0.098, 26), ("grass2.png", 0.145, 32),
        ("grass1.png", 0.195, 28), ("grass2.png", 0.245, 34),
        ("grass1.png", 0.300, 26), ("grass2.png", 0.355, 30),
        ("grass1.png", 0.410, 28), ("grass2.png", 0.462, 34),
        ("grass1.png", 0.515, 26), ("grass2.png", 0.568, 32),
        ("grass1.png", 0.620, 28), ("grass2.png", 0.672, 30),
        ("grass1.png", 0.725, 26), ("grass2.png", 0.778, 34),
        ("grass1.png", 0.830, 28), ("grass2.png", 0.885, 32),
        ("grass1.png", 0.940, 30), ("grass2.png", 0.975, 26),
    ]
    for name, u, w in specs:
        im = fit_w(load(name), w * S)
        paste_at(img, tint(im, GRASS, alpha=255), u * W * S, H * S - im.height + 0.004 * H * S)
    return img


def main():
    layers = [
        ("layer01.png", layer_sky),
        ("layer02.png", layer_clouds_far),
        ("layer03.png", layer_clouds_near),
        ("layer04.png", layer_far_mountains),
        ("layer05.png", layer_hills),
        ("layer06.png", layer_castle),
        ("layer07.png", layer_ground),
        ("layer08.png", layer_near_tree_left),
        ("layer09.png", layer_near_tree_right),
        ("layer10.png", layer_grass),
    ]
    total = 0
    for name, fn in layers:
        p = finish(fn(), name)
        sz = os.path.getsize(p)
        total += sz
        print(f"{name}  {sz/1024:6.1f} KB")
    print(f"合计 {total/1024:.1f} KB")


if __name__ == "__main__":
    main()

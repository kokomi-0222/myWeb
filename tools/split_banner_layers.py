"""
横幅图层拆分工具
将一张宽幅图片自动拆分为 N 个视差图层（PNG + 透明度），并生成 Vue 组件配置代码。

依赖: pip install Pillow numpy scikit-learn
用法: python tools/split_banner_layers.py <输入图片> [图层数] [输出目录]
"""

import sys
import os
import json
import numpy as np
from PIL import Image, ImageFilter
from pathlib import Path

# 配置
LAYER_COUNT = 12          # 默认拆分层数
OUTPUT_WIDTH = 3840       # 输出宽度
OUTPUT_DIR = "output_layers"


def split_by_depth(img_path, n_layers=LAYER_COUNT, out_dir=OUTPUT_DIR):
    """基于颜色聚类 + 边缘感知将图片拆分为深度图层"""

    print(f"[1/4] 加载图片: {img_path}")
    img = Image.open(img_path).convert("RGBA")
    # 保持宽高比缩放到目标宽度
    ratio = OUTPUT_WIDTH / img.width
    new_h = int(img.height * ratio)
    img = img.resize((OUTPUT_WIDTH, new_h), Image.LANCZOS)
    print(f"  尺寸: {img.width}x{img.height}")

    arr = np.array(img)

    # 分离 alpha 通道（如果有的话）
    has_alpha = arr.shape[2] == 4 and arr[:, :, 3].min() < 255

    print(f"[2/4] 计算深度图 (K-means 色彩聚类, k={n_layers})...")
    from sklearn.cluster import KMeans

    # 用像素颜色 + 空间位置做聚类
    h, w = arr.shape[:2]
    # 降采样加速聚类
    scale = max(1, (h * w) // 50000)
    small = arr[::scale, ::scale, :3].reshape(-1, 3) if not has_alpha else arr[::scale, ::scale, :3][arr[::scale, ::scale, 3] > 128].reshape(-1, 3)
    if len(small) == 0:
        small = arr[::scale, ::scale, :3].reshape(-1, 3)

    # 添加空间坐标作为特征（保留空间连续性）
    ys, xs = np.mgrid[0:h:scale, 0:w:scale]
    spatial = np.stack([ys.flatten()[:len(small)], xs.flatten()[:len(small)]], axis=1) * 0.1
    features = np.concatenate([small.astype(np.float32), spatial.astype(np.float32)], axis=1)

    kmeans = KMeans(n_clusters=n_layers, random_state=42, n_init=3)
    labels = kmeans.fit_predict(features)

    # 按亮度排序（暗=背景，亮=前景）
    centers_luminance = kmeans.cluster_centers_[:, :3].dot([0.299, 0.587, 0.114])
    depth_order = np.argsort(centers_luminance)

    print(f"[3/4] 生成 {n_layers} 张图层 PNG...")
    os.makedirs(out_dir, exist_ok=True)

    layer_configs = []
    full_mask = np.zeros((h, w), dtype=bool)

    for depth_idx, cluster_idx in enumerate(depth_order):
        # 创建该聚类的 mask（还原到原始分辨率）
        cluster_color = kmeans.cluster_centers_[cluster_idx, :3]
        # 在全分辨率上找属于该聚类的像素
        pixels = arr[:, :, :3].reshape(-1, 3).astype(np.float32)
        if not has_alpha:
            dist = np.sum((pixels - cluster_color) ** 2, axis=1)
            mask = dist.reshape(h, w) < np.percentile(dist, 15)
        else:
            # 有 alpha 通道：仅在非透明区域匹配
            alpha_mask = arr[:, :, 3] > 128
            dist = np.sum((pixels - cluster_color) ** 2, axis=1).reshape(h, w)
            mask = (dist < np.percentile(dist[alpha_mask.flatten()], 20)) & alpha_mask

        # 形态学清理
        from scipy.ndimage import binary_opening, binary_closing
        mask = binary_opening(mask, np.ones((3, 3)))
        mask = binary_closing(mask, np.ones((5, 5)))

        # 边缘羽化
        mask_float = mask.astype(np.float32)
        mask_float = Image.fromarray((mask_float * 255).astype(np.uint8))
        mask_float = mask_float.filter(ImageFilter.GaussianBlur(radius=1.5))
        mask_float = np.array(mask_float).astype(np.float32) / 255.0

        # 创建带透明度的图层
        layer_img = np.copy(arr)
        layer_img[:, :, 3] = (mask_float * 255 * 0.95).astype(np.uint8)  # 微透避免硬边
        layer_img[mask_float < 0.05, 3] = 0  # 低于阈值完全透明

        filename = f"layer_{depth_idx + 1:02d}.png"
        filepath = os.path.join(out_dir, filename)
        Image.fromarray(layer_img).save(filepath, "PNG")
        print(f"  ✓ {filename}")

        # 生成视差参数（背景层动得少，前景层动得多）
        t = depth_idx / max(n_layers - 1, 1)  # 0=背景, 1=前景
        layer_configs.append({
            "key": f"layer{depth_idx + 1}",
            "path": filename,
            "x": round(0.02 + t * 0.18, 3),      # 水平偏移权重
            "y": round(-0.001 - t * 0.009, 3),    # 垂直偏移权重
            "s": round(0.01 + t * 0.07, 3),       # 缩放权重
            "r": round(t * 0.2, 2),               # 旋转权重（仅前景）
            "width": OUTPUT_WIDTH,
            "height": new_h,
        })

        full_mask = full_mask | mask

    # 保存配置
    config_path = os.path.join(out_dir, "layer_config.json")
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(layer_configs, f, ensure_ascii=False, indent=2)
    print(f"\n[4/4] ✓ 配置已保存: {config_path}")
    print(f"  图层文件: {out_dir}/layer_01.png ~ layer_{n_layers:02d}.png")

    # 生成 Vue 组件 layerList 配置代码
    print("\n--- 复制以下代码替换 Banner.vue 中的 defaultLayers ---")
    print("const defaultLayers = [];")
    for cfg in layer_configs:
        print(f'defaultLayers.push({{ path: new URL("../../assets/images/banner/{cfg["key"]}.png", import.meta.url).href, x: {cfg["x"]}, y: {cfg["y"]}, s: {cfg["s"]}, r: {cfg["r"]}, width: {cfg["width"]}, height: {cfg["height"]}, alt: "{cfg["key"]}" }});')

    return layer_configs


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python split_banner_layers.py <图片路径> [图层数] [输出目录]")
        print("示例: python split_banner_layers.py banner.jpg 12 ./layers")
        sys.exit(1)

    img_path = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else LAYER_COUNT
    out = sys.argv[3] if len(sys.argv) > 3 else OUTPUT_DIR

    if not os.path.exists(img_path):
        print(f"错误: 文件不存在 - {img_path}")
        sys.exit(1)

    split_by_depth(img_path, n, out)

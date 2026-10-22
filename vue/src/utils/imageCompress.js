/**
 * 图片压缩
 *
 * 场景：服务器（Nginx）的请求体上限是 2MB，手机拍的原图常有 3~8MB，
 * 直接上传会被 413 掐断，前端还拿不到响应体，只能显示含糊的「网络异常」。
 * 与其把用户拦下来，不如在「选完图、发请求前」用 canvas 压到上限以内。
 *
 * 设计取舍：
 * - 没有透明通道 → 一律编码成 JPEG，靠「降质量 + 缩尺寸」两级循环逼近目标体积，压缩比最高
 * - 有透明通道 → 先试 PNG 保住透明背景；PNG 压不下来（canvas.toBlob 会忽略 quality 参数）
 *   再铺白底转 JPEG 兜底
 * - GIF 可能是动图，canvas 只能取到第一帧，压了就变静态图，直接跳过不处理
 * - 超大图先按 MAX_EDGE 收敛，避免 canvas 一次性分配几百 MB 内存把标签页卡死
 */

/** 单边最大像素，超过就先等比缩到这个范围再谈压缩 */
const MAX_EDGE = 4096;
/** 缩到这个尺寸以下就不再缩了，再小就没法看了 */
const MIN_EDGE = 96;

/** 各输出格式对应的文件后缀（后端按后缀做白名单校验，必须对得上） */
const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** 可以直接有损压缩的格式（浏览器会尊重 quality 参数） */
const LOSSY_TYPES = new Set(["image/jpeg", "image/webp"]);

/** canvas 能稳定输出的格式 */
function pickEncodeType(sourceType, keepAlpha) {
  if (keepAlpha) return "image/png";
  if (sourceType === "image/webp") return "image/webp";
  return "image/jpeg";
}

/** 解码图片。优先 createImageBitmap（可带 EXIF 方向，且在解码线程完成），失败再退回 <img> */
async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      // from-image：让手机竖拍的照片按 EXIF 方向摆正，否则画到 canvas 上是躺倒的
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* 落到 <img> 方案 */
      }
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片解码失败"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 把图片画到指定尺寸的 canvas 上，background 用于把透明区域铺成实色 */
function drawToCanvas(source, width, height, background) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * 检测是否有「真正的」透明区域。
 * 不扫原图（几千万像素会卡死），而是缩到 64×64 采样。
 * 阈值取 alpha < 200 且占比 > 1%：
 * 只是边缘抗锯齿产生几个半透明像素的 PNG，不该被当成透明图处理，
 * 否则会为了保透明一路缩尺寸，把图缩得没法看。
 */
function detectAlpha(canvas) {
  const size = 64;
  const probe = document.createElement("canvas");
  probe.width = size;
  probe.height = size;
  const ctx = probe.getContext("2d");
  ctx.drawImage(canvas, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 200) transparent += 1;
  }
  return transparent / (size * size) > 0.01;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * 在给定尺寸上尝试编码到目标体积以内。
 * 先降质量，质量降到底还超再缩尺寸重来，逐轮逼近。
 * @returns {Promise<{blob: Blob, type: string, width: number, height: number} | null>}
 */
async function encodeUnderLimit(source, initWidth, initHeight, maxBytes, keepAlpha) {
  let width = initWidth;
  let height = initHeight;

  for (let round = 0; round < 8; round += 1) {
    // 每轮按当前尺寸重画，避免反复缩放的画质累积损失
    const canvas = drawToCanvas(source, width, height, keepAlpha ? null : "#ffffff");

    if (keepAlpha) {
      // 透明图先靠「缩尺寸」保 PNG —— 透明信息丢了找不回来，尺寸小一点还能看
      const pngBlob = await canvasToBlob(canvas, "image/png");
      if (pngBlob && pngBlob.size <= maxBytes) {
        return { blob: pngBlob, type: "image/png", width, height };
      }
    } else {
      // 不透明图：JPEG 降质量，压缩比最高
      for (let q = 0.92; q >= 0.4; q -= 0.1) {
        const blob = await canvasToBlob(canvas, "image/jpeg", q);
        if (blob && blob.size <= maxBytes) {
          return { blob, type: "image/jpeg", width, height };
        }
      }
    }

    // 这一尺寸怎么压都超，缩一圈再来
    width *= 0.8;
    height *= 0.8;
    if (Math.min(width, height) < MIN_EDGE) break;
  }

  // 最后手段：透明图缩到最小仍压不下来，只能铺白底转 JPEG
  if (keepAlpha) {
    let w = initWidth;
    let h = initHeight;
    for (let round = 0; round < 8; round += 1) {
      const flat = drawToCanvas(source, w, h, "#ffffff");
      for (let q = 0.9; q >= 0.4; q -= 0.1) {
        const blob = await canvasToBlob(flat, "image/jpeg", q);
        if (blob && blob.size <= maxBytes) {
          return { blob, type: "image/jpeg", width: w, height: h };
        }
      }
      w *= 0.8;
      h *= 0.8;
      if (Math.min(w, h) < MIN_EDGE) break;
    }
  }

  return null;
}

/** 用压缩结果替换原文件：改扩展名（后端按后缀校验）、保留原始文件名主干 */
function toCompressedFile(file, blob, type) {
  const ext = EXT_BY_TYPE[type] || "jpg";
  const baseName = (file.name || "image").replace(/\.[^./\\]+$/, "") || "image";
  return new File([blob], `${baseName}.${ext}`, {
    type,
    lastModified: Date.now(),
  });
}

/**
 * 压缩单张图片到 maxBytes 以内。
 * 已经够小、或者压不动的类型，会原样返回（compressed: false）。
 *
 * @param {File} file
 * @param {number} maxBytes 目标上限（字节）
 * @returns {Promise<{file: File, compressed: boolean, reason?: string, originalSize: number, size: number}>}
 */
export async function compressImage(file, maxBytes) {
  const originalSize = file?.size ?? 0;
  const untouched = (reason) => ({ file, compressed: false, reason, originalSize, size: originalSize });

  if (!file || !file.type?.startsWith("image/")) return untouched("not-image");
  if (file.size <= maxBytes) return untouched("small");
  // 动图压完只剩第一帧，宁可让用户知道换一张
  if (file.type === "image/gif") return untouched("animated");
  // Safari 的 HEIC 之类，canvas 未必解得开，交给下面的 catch 兜底

  let source;
  try {
    source = await decodeImage(file);
  } catch {
    return untouched("decode-failed");
  }

  try {
    const rawWidth = source.width;
    const rawHeight = source.height;
    if (!rawWidth || !rawHeight) return untouched("decode-failed");

    // 先收敛到 MAX_EDGE 以内，控制内存
    const fit = Math.min(1, MAX_EDGE / Math.max(rawWidth, rawHeight));
    const width = Math.round(rawWidth * fit);
    const height = Math.round(rawHeight * fit);

    // JPEG 不可能带透明通道，省掉一次采样绘制
    const mightHaveAlpha = file.type === "image/png" || file.type === "image/webp";
    let keepAlpha = false;
    if (mightHaveAlpha) {
      const probeCanvas = drawToCanvas(source, Math.min(width, 512), Math.min(height, 512));
      keepAlpha = detectAlpha(probeCanvas);
    }

    const result = await encodeUnderLimit(source, width, height, maxBytes, keepAlpha);
    if (!result) return untouched("too-large");

    const outFile = toCompressedFile(file, result.blob, result.type);
    return {
      file: outFile,
      compressed: true,
      originalSize,
      size: outFile.size,
      width: result.width,
      height: result.height,
    };
  } finally {
    // ImageBitmap 占的是 GPU/原生内存，用完必须释放
    if (typeof source.close === "function") source.close();
  }
}

/**
 * 批量压缩，串行执行（并行解码大图容易把内存打满）。
 *
 * @returns {Promise<{files: File[], compressedCount: number, failed: File[], skippedAnimated: File[]}>}
 */
export async function compressImages(files, maxBytes) {
  const out = [];
  const failed = [];
  const skippedAnimated = [];
  let compressedCount = 0;

  for (const file of files) {
    const result = await compressImage(file, maxBytes);
    if (result.compressed) {
      compressedCount += 1;
      out.push(result.file);
      continue;
    }
    if (result.reason === "animated" || result.reason === "too-large") {
      // 压不动的单独收集，交给调用方提示
      failed.push(file);
      if (result.reason === "animated") skippedAnimated.push(file);
      continue;
    }
    // 本来就不大 / 解码失败的，照常放行（后来的 413 提示仍能兜住）
    out.push(file);
  }

  return { files: out, compressedCount, failed, skippedAnimated };
}

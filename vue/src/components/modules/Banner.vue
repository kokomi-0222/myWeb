<template>
  <!-- 给外层容器绑定鼠标移入/离开事件 -->
  <div 
    class="bili-header__banner"
    @mouseenter="isHover = true"
    @mouseleave="isHover = false"
  >
    <!-- 兜底背景（取背景图列表第一张，兼容本地/远程URL） -->
    <picture v-for="bg in bgImageList" class="v-img banner-img">
      <img :src="bg" alt="banner背景" />
    </picture>

    <!-- 核心：视差滑动的animated-banner -->
    <div class="animated-banner" ref="bannerRef">
      <!-- 遍历传入的图层列表渲染（兼容本地/远程URL） -->
      <div
        v-for="(layer, index) in layerList"
        :key="layer.key || index"
        class="layer"
      >
        <img
          :src="layer.path"
          :data-width="layer.width || 3840"
          :data-height="layer.height || 360"
          :alt="layer.alt || `layer${index + 1}`"
        />
      </div>
    </div>

    <div class="header-banner__inner"></div>
  </div>
</template>

<script>
// 用 import.meta.glob 预加载所有 banner 图片，确保 Vite 打包时包含它们
// 注意：必须放在 <script> (非 setup) 中，否则 defineProps 的默认值无法访问
const bannerLayerModules = import.meta.glob(
  "../../assets/images/banner/layer*.png",
  { eager: true, import: "default" }
);

const bannerBgModules = import.meta.glob(
  "../../assets/images/bgbili.png",
  { eager: true, import: "default" }
);
</script>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from "vue";

// 定义可配置的参数（核心：图层列表+背景图列表，兼容本地/远程URL）
const props = defineProps({
  // 核心：图层列表（必传/默认32层本地示例）
  layerList: {
    type: Array,
    default: () => {
      const defaultLayers = [];
      for (let i = 1; i <= 32; i++) {
        const layerKey = `../../assets/images/banner/layer${String(i).padStart(
          2,
          "0"
        )}.png`;
        const layerUrl = bannerLayerModules[layerKey];
        // 跳过不存在的图片
        if (!layerUrl) continue;
        let x = 0,
          y = 0,
          s = 0,
          r = 0;

        switch (i) {
          // ===== 远景背景（不移动）=====
          case 1:
            (x = 0), (y = 0), (s = 0), (r = 0);
            break;
          case 2:
            (x = 0), (y = 0), (s = 0), (r = 0);
            break;

          // ===== 中景（左右散开 + 轻微缩放）=====
          case 3:
            (x = 0), (y = -0.001), (s = 0.011), (r = 0);
            break; // 居中
          case 4:
            (x = -0.02), (y = -0.001), (s = 0.011), (r = 0);
            break; // 左侧树 ←
          case 5:
            (x = 0.02), (y = -0.001), (s = 0.011), (r = 0);
            break; // 右侧树 →
          case 6:
            (x = -0.02), (y = -0.001), (s = 0.011), (r = 0);
            break; // 左侧树 ←
          case 7:
            (x = 0), (y = -0.001), (s = 0.011), (r = 0);
            break; // 居中
          case 8:
            (x = 0.02), (y = -0.001), (s = 0.011), (r = 0);
            break; // 右侧树 →

          // ===== 近中景 =====
          case 9:
            (x = 0.02), (y = -0.001), (s = 0.012), (r = 0);
            break;
          case 10:
            (x = -0.02), (y = -0.001), (s = 0.013), (r = 0);
            break; // 左侧树 ←
          case 11:
            (x = 0.02), (y = -0.002), (s = 0.014), (r = 0);
            break;
          case 12:
            (x = 0), (y = -0.002), (s = 0.014), (r = 0);
            break; // 居中（两侧都有）

          // ===== 主体建筑（居中，不偏移，仅缩放=由远及近）=====
          case 13:
            (x = 0), (y = -0.002), (s = 0.02), (r = 0);
            break; // 城堡主体
          case 14:
            (x = 0), (y = -0.003), (s = 0.02), (r = 0);
            break; // 城堡
          case 15:
            (x = 0), (y = -0.003), (s = 0.02), (r = 0);
            break; // 城堡
          case 16:
            (x = 0), (y = -0.003), (s = 0.02), (r = 0);
            break; // 城堡
          case 17:
            (x = 0), (y = -0.003), (s = 0.02), (r = 0);
            break; // 城堡

          // ===== 前景过渡 =====
          case 18:
            (x = 0.09), (y = -0.003), (s = 0.017), (r = 0);
            break; // 右侧元素
          case 19:
            (x = 0), (y = -0.003), (s = 0.02), (r = 0);
            break; // 城堡前层（居中）
          case 20:
            (x = 0), (y = -0.003), (s = 0.02), (r = 0);
            break; // 城堡前层（居中）
          case 21:
            (x = 0), (y = -0.003), (s = 0.017), (r = 0);
            break; // 混合
          case 22:
            (x = 0.12), (y = -0.003), (s = 0.017), (r = 0);
            break; // 右侧
          case 23:
            (x = 0.12), (y = -0.003), (s = 0.017), (r = 0);
            break; // 右侧

          // ===== 前景树 =====
          case 24:
            (x = 0), (y = 0.1), (s = 0), (r = 0.15);
            break; // 右侧树（旋转）
          case 25:
            (x = -0.15), (y = -0.004), (s = 0.02), (r = 0);
            break; // ★ 左侧前景树 ←
          case 26:
            (x = 0.18), (y = -0.006), (s = 0.03), (r = 0);
            break; // 右侧前景树 →
          case 27:
            (x = 0.18), (y = -0.007), (s = 0.04), (r = 0);
            break; // 右侧前景树 →
          case 28:
            (x = -0.2), (y = -0.005), (s = 0.05), (r = 0);
            break; // ★ 左侧前景树 ←
          case 29:
            (x = 0.2), (y = -0.005), (s = 0.06), (r = 0);
            break; // 右侧前景 →
          case 30:
            (x = 0.2), (y = -0.01), (s = 0.07), (r = 0);
            break; // 右侧 →
          case 31:
            (x = 0.2), (y = -0.01), (s = 0.08), (r = 0);
            break; // 右侧 →

          // ===== 最前景 =====
          case 32:
            (x = 0), (y = 0.1), (s = 0), (r = 0.2);
            break; // 右侧树（旋转）
        }

        defaultLayers.push({
          path: layerUrl,
          x: x,
          y: y,
          s: s,
          r: r,
          width: 3840,
          height: 360,
          alt: `layer${i}`,
        });
      }
      return defaultLayers;
    },
  },
  // 背景图列表（默认1张本地路径，支持远程URL）
  bgImageList: {
    type: Array,
    default: () => {
      const bgUrl = bannerBgModules["../../assets/images/bgbili.png"];
      return bgUrl ? [bgUrl] : [];
    },
  },
  // layerList 中 x 字段约定：
  //   负值(-) = 左侧元素 → 鼠标右移（由远及近）时向左散开
  //   正值(+) = 右侧元素 → 鼠标右移（由远及近）时向右散开
  //   零值(0) = 居中/混合元素 → 不产生水平位移
  //   绝对大小控制偏移幅度（前景层 > 背景层）
  // 最大偏移量
  maxTranslate: {
    type: Number,
    default: 300,
  },
  // 横幅高度
  bannerHeight: {
    type: Number,
    default: 160,
  },
  // 新增：鼠标离开后是否重置位置（默认false）
  resetOnLeave: {
    type: Boolean,
    default: false,
  }
});

// 新增：鼠标悬浮状态
const isHover = ref(false);
// 初始化ref
const bannerRef = ref(null);
let layers = [];
let mouseMoveHandler = null;

// 性能优化：使用 requestAnimationFrame，vsync 对齐更流畅
let rafId = null;
const scheduleUpdate = (fn) => {
  if (rafId) return; // 已有待执行的帧，跳过
  rafId = requestAnimationFrame(() => {
    rafId = null;
    fn();
  });
};

// 鼠标离开后图层缓动回到初始位置
let idleTweenId = null;
const animateToIdle = () => {
  if (!layers || layers.length === 0) return;
  const step = () => {
    let allDone = true;
    for (let i = 0; i < layers.length; i++) {
      const current = parseTransform(layers[i].style.transform);
      // 缓动插值：每帧靠近目标 (0,0,1,0) 10%
      const tx = current.tx * 0.9;
      const ty = current.ty * 0.9;
      const sc = 1 + (current.sc - 1) * 0.9;
      const rt = current.rt * 0.9;
      layers[i].style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(
        1
      )}px, 0) scale(${sc.toFixed(3)}) rotate(${rt.toFixed(2)}deg)`;
      if (
        Math.abs(tx) > 0.1 ||
        Math.abs(ty) > 0.1 ||
        Math.abs(sc - 1) > 0.001 ||
        Math.abs(rt) > 0.01
      ) {
        allDone = false;
      }
    }
    if (!allDone) {
      idleTweenId = requestAnimationFrame(step);
    }
  };
  idleTweenId = requestAnimationFrame(step);
};

const cancelIdleTween = () => {
  if (idleTweenId) {
    cancelAnimationFrame(idleTweenId);
    idleTweenId = null;
  }
};

// 解析当前 transform 值，用于缓动插值
const parseTransform = (t) => {
  const def = { tx: 0, ty: 0, sc: 1, rt: 0 };
  if (!t || t === "none") return def;
  const m3 = t.match(/translate3d\(([^,]+)px,\s*([^,]+)px/);
  const ms = t.match(/scale\(([^)]+)\)/);
  const mr = t.match(/rotate\(([^)]+)deg\)/);
  return {
    tx: m3 ? parseFloat(m3[1]) : 0,
    ty: m3 ? parseFloat(m3[2]) : 0,
    sc: ms ? parseFloat(ms[1]) : 1,
    rt: mr ? parseFloat(mr[1]) : 0,
  };
};

// 核心视差逻辑
const initParallax = async () => {
  await nextTick();

  if (bannerRef.value) {
    layers = bannerRef.value.querySelectorAll(".layer");
  }

  mouseMoveHandler = (e) => {
    if (!isHover.value || !layers || layers.length === 0) return;

    scheduleUpdate(() => {
      cancelIdleTween();
      // 同时响应 X 轴和 Y 轴，Y 轴偏移减半营造更自然的纵深感
      const gx = e.clientX / window.innerWidth - 0.5;
      const gy = (e.clientY / window.innerHeight - 0.5) * 0.5;

      for (let i = 0; i < layers.length; i++) {
        const { x, y, s, r } = props.layerList[i];
        // x 符号约定：负值=左侧元素（鼠标右移时向左散开），正值=右侧元素（鼠标右移时向右散开）
        // 模拟 3D 透视效果：鼠标右移=由远及近，前景元素从中心向两侧散开；左移相反
        const tx = gx * props.maxTranslate * x + gy * props.maxTranslate * y * 0.3;
        const ty = gx * props.maxTranslate * y + gy * props.maxTranslate * x * 0.2;
        const scale = 1 + gx * s;
        const rotate = gx * r;
        // translate3d 触发 GPU 合成层，性能优于 translate
        layers[i].style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(
          1
        )}px, 0) scale(${scale.toFixed(3)}) rotate(${rotate.toFixed(2)}deg)`;
      }
    });
  };

  window.addEventListener("mousemove", mouseMoveHandler, { passive: true });
};

// 组件生命周期
onMounted(() => {
  initParallax();
});

onUnmounted(() => {
  if (mouseMoveHandler) {
    window.removeEventListener("mousemove", mouseMoveHandler);
  }
  if (rafId) cancelAnimationFrame(rafId);
  cancelIdleTween();
  layers = [];
});

// 鼠标离开时缓动回到初始位置
watch(isHover, (hovering) => {
  if (!hovering) {
    // 取消待执行的视差帧，启动缓动回初始位置
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    animateToIdle();
  }
});
</script>

<style scoped>
.bili-header__banner {
  position: relative;
  width: 100%;
  height: v-bind(bannerHeight + "px");
  overflow: hidden;
  cursor: default;
}

/* 兜底背景 */
.banner-img {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.banner-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 视差层容器 */
.animated-banner {
  position: absolute;
  inset: 0;
  z-index: 2;
}

/* 单个视差层（性能优化） */
.layer {
  position: absolute;
  inset: 0;
  transition: transform 0.05s ease-out;
  z-index: 2;
  will-change: transform;
  backface-visibility: hidden;
}
.layer img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 1;
  mix-blend-mode: normal;
}

/* 底部渐变遮罩 */
.taper-line {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30px;
  background: linear-gradient(transparent, #ffffff);
  z-index: 4;
}

.header-banner__inner {
  position: absolute;
  z-index: 3;
  left: 50px;
  top: 50%;
  transform: translateY(-50%);
}
</style>

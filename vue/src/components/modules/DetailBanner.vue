<template>
  <div
    ref="rootRef"
    class="detail-banner"
    @mousemove="handleMove"
    @mouseleave="handleLeave"
  >
    <div class="detail-banner__stage" ref="stageRef">
      <div
        v-for="(layer, index) in layerList"
        :key="layer.key || index"
        class="detail-banner__layer"
      >
        <img
          :src="layer.path"
          :alt="layer.alt || `layer${index + 1}`"
          draggable="false"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from "vue";

/**
 * 详情页专用视差横幅
 *
 * 与首页 Banner.vue 的区别（首页那套保持原样，不受影响）：
 * 1. 归一化基准是「横幅容器」而不是整个窗口 —— 鼠标在横幅里就能走完全程，
 *    首页那套要鼠标移到浏览器边缘才到极值，手感发死。
 * 2. 每层都有梯度位移，不是只有前景两片在滑。
 * 3. 用 rAF + lerp 做惯性跟随，替代 CSS transition 的瞬间到位。
 */
const props = defineProps({
  // 每层：{ path, x, y, s, r, width, height, alt }
  // x/y: 位移系数（负=向左/上散开，正=向右/下散开），s: 缩放系数，r: 旋转（度）
  layerList: {
    type: Array,
    default: () => [],
  },
  // 横幅高度
  bannerHeight: {
    type: Number,
    default: 160,
  },
  // 位移基准像素：nx 走到 ±1 时，系数 1.0 的层平移这么多
  maxTranslate: {
    type: Number,
    default: 80,
  },
  // 所有层的基础放大：留出安全余量，避免平移时画面边缘露出底色
  baseScale: {
    type: Number,
    default: 1.08,
  },
  // 每帧向目标靠近的比例，越小越「重」越慢
  damping: {
    type: Number,
    default: 0.14,
  },
  // 竖向灵敏度衰减，避免 160px 高度里上下稍有移动就晃得很厉害
  verticalGain: {
    type: Number,
    default: 0.55,
  },
});

const rootRef = ref(null);
const stageRef = ref(null);

let layerEls = [];
// 当前值与目标值，逐帧插值
let cur = [];
let tgt = [];

let rafId = null;
let running = false;
let hovering = false;

const ensureState = () => {
  if (cur.length !== layerEls.length) {
    cur = layerEls.map(() => ({ tx: 0, ty: 0, sc: props.baseScale, rt: 0 }));
    tgt = layerEls.map(() => ({ tx: 0, ty: 0, sc: props.baseScale, rt: 0 }));
  }
};

const writeLayer = (i) => {
  const c = cur[i];
  const el = layerEls[i];
  if (!el) return;
  el.style.transform = `translate3d(${c.tx.toFixed(2)}px, ${c.ty.toFixed(
    2
  )}px, 0) scale(${c.sc.toFixed(4)}) rotate(${c.rt.toFixed(2)}deg)`;
};

const loop = () => {
  let moving = false;
  for (let i = 0; i < layerEls.length; i++) {
    const c = cur[i];
    const t = tgt[i];
    c.tx += (t.tx - c.tx) * props.damping;
    c.ty += (t.ty - c.ty) * props.damping;
    c.sc += (t.sc - c.sc) * props.damping;
    c.rt += (t.rt - c.rt) * props.damping;

    if (
      Math.abs(t.tx - c.tx) > 0.02 ||
      Math.abs(t.ty - c.ty) > 0.02 ||
      Math.abs(t.sc - c.sc) > 0.00005 ||
      Math.abs(t.rt - c.rt) > 0.005
    ) {
      moving = true;
    }
    writeLayer(i);
  }

  // 停稳且没有悬停时就不再占用帧
  if (!moving && !hovering) {
    running = false;
    rafId = null;
    return;
  }
  rafId = requestAnimationFrame(loop);
};

const startLoop = () => {
  if (running) return;
  running = true;
  rafId = requestAnimationFrame(loop);
};

const handleMove = (e) => {
  if (!rootRef.value || !layerEls.length) return;
  hovering = true;

  const rect = rootRef.value.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  // 相对横幅容器归一化：中心为 0，左右/上下边缘为 ±1
  let nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  let ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
  nx = Math.max(-1, Math.min(1, nx));
  ny = Math.max(-1, Math.min(1, ny)) * props.verticalGain;

  const base = props.maxTranslate;

  for (let i = 0; i < layerEls.length; i++) {
    const layer = props.layerList[i] || {};
    const x = layer.x ?? 0;
    const y = layer.y ?? 0;
    const s = layer.s ?? 0;
    const r = layer.r ?? 0;

    // 水平按系数散开，竖向做交叉耦合，制造轻微「转头」的立体感
    tgt[i].tx = nx * base * x + ny * base * y * 0.35;
    tgt[i].ty = ny * base * y + nx * base * x * 0.06;
    tgt[i].sc = props.baseScale + Math.abs(nx) * s;
    tgt[i].rt = nx * r;
  }
  startLoop();
};

const handleLeave = () => {
  hovering = false;
  for (let i = 0; i < tgt.length; i++) {
    tgt[i].tx = 0;
    tgt[i].ty = 0;
    tgt[i].sc = props.baseScale;
    tgt[i].rt = 0;
  }
  startLoop();
};

onMounted(async () => {
  await nextTick();
  if (!stageRef.value) return;
  layerEls = Array.from(stageRef.value.querySelectorAll(".detail-banner__layer"));
  ensureState();
  layerEls.forEach((_, i) => writeLayer(i));
});

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  running = false;
  layerEls = [];
  cur = [];
  tgt = [];
});
</script>

<style scoped>
.detail-banner {
  position: relative;
  width: 100%;
  height: v-bind(bannerHeight + "px");
  overflow: hidden;
  user-select: none;
}

.detail-banner__stage {
  position: absolute;
  inset: 0;
}

.detail-banner__layer {
  position: absolute;
  inset: 0;
  will-change: transform;
  backface-visibility: hidden;
  /* 首帧就带基础放大，避免 JS 接管前闪一下原尺寸 */
  transform: translate3d(0, 0, 0) scale(v-bind(baseScale)) rotate(0deg);
}

.detail-banner__layer img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 底对齐：宽屏下只裁顶部天空，保住底部的前景 */
  object-position: center bottom;
  display: block;
  pointer-events: none;
}
</style>

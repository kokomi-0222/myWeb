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
        const layerName = `../../assets/images/banner/layer${String(i).padStart(
          2,
          "0"
        )}.png`;
        const layerUrl = new URL(layerName, import.meta.url).href;
        let x = 0,
          y = 0,
          s = 0,
          r = 0;

        switch (i) {
          case 1:
            (x = 0), (y = 0), (s = 0), (r = 0);
            break;
          case 2:
            (x = 0), (y = 0), (s = 0), (r = 0);
            break;
          case 3:
          case 4:
          case 5:
          case 6:
          case 7:
          case 8:
            (x = 0), (y = -0.001), (s = 0.011), (r = 0);
            break;
          case 9:
            (x = 0.012), (y = -0.001), (s = 0.012), (r = 0);
            break;
          case 10:
            (x = 0.013), (y = -0.001), (s = 0.013), (r = 0);
            break;
          case 11:
            (x = 0.013), (y = -0.002), (s = 0.014), (r = 0);
            break;
          case 12:
            (x = 0.014), (y = -0.002), (s = 0.014), (r = 0);
            break;
          case 13:
            (x = 0.015), (y = -0.002), (s = 0.015), (r = 0);
            break;
          case 14:
          case 15:
            (x = 0.015), (y = -0.003), (s = 0.016), (r = 0);
            break;
          case 16:
            (x = 0.015), (y = -0.003), (s = 0.016), (r = 0);
            break;
          case 17:
            (x = 0.016), (y = -0.003), (s = 0.016), (r = 0);
            break;
          case 18:
            (x = 0.09), (y = -0.003), (s = 0.017), (r = 0);
            break;
          case 19:
            (x = 0.10), (y = -0.003), (s = 0.017), (r = 0);
            break;
          case 20:
            (x = 0.12), (y = -0.003), (s = 0.017), (r = 0);
            break;
          case 21:
            (x = 0.12), (y = -0.003), (s = 0.017), (r = 0);
            break;
          case 22:
            (x = 0.12), (y = -0.003), (s = 0.017), (r = 0);
            break;
          case 23:
            (x = 0.12), (y = -0.003), (s = 0.017), (r = 0);
            break;
          case 24:
            (x = 0), (y = 0.1), (s = 0), (r = 0.15);
            break;
          case 25:
            (x = 0.15), (y = -0.004), (s = 0.02), (r = 0);
            break;
          case 26:
            (x = 0.18), (y = -0.006), (s = 0.03), (r = 0);  
            break;
          case 27:
            (x = 0.18), (y = -0.007), (s = 0.04), (r = 0);  
            break;
          case 28:
            (x = 0.2), (y = -0.005), (s = 0.05), (r = 0);
            break;  
          case 29:
            (x = 0.2), (y = -0.005), (s = 0.06), (r = 0);
            break;
          case 30:    
            (x = 0.2), (y = -0.01), (s = 0.07), (r = 0);
            break;
          case 31:
            (x = 0.2), (y = -0.01), (s = 0.08), (r = 0);
            break;
          case 32:
            (x = 0), (y = 0.1), (s = 0), (r = 0.2);
            break;
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
    default: () => [new URL("../../assets/images/bgbili.png", import.meta.url).href],
  },
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

// 性能优化：节流函数
const throttle = (fn, delay = 16) => {
  let timer = null;
  return (...args) => {
    if (!timer) {
      timer = setTimeout(() => {
        fn.apply(this, args);
        timer = null;
      }, delay);
    }
  };
};

// 新增：重置图层到初始位置
const resetLayers = () => {
  if (!layers || layers.length === 0) return;
  layers.forEach(layer => {
    layer.style.transform = 'translate(0px, 0px) scale(1) rotate(0deg)';
  });
};

// 核心视差逻辑
const initParallax = async () => {
  await nextTick();

  // 获取所有图层（数量由layerList决定）
  if (bannerRef.value) {
    layers = bannerRef.value.querySelectorAll(".layer");
  }

  // 节流处理鼠标事件
  mouseMoveHandler = throttle((e) => {
    // 新增：只有鼠标悬浮时才执行动画
    if (!isHover.value || !layers || layers.length === 0) return;

    const globalX = e.clientX / window.innerWidth - 0.5;

    // 遍历图层
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const { x, y, s, r } = props.layerList[i];
      const tx = globalX * props.maxTranslate * x;
      const ty = globalX * props.maxTranslate * y;
      const scale = 1 + globalX * s;
      const rotate = globalX * r;
      layer.style.transform = `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotate}deg)`;
    }
  });

  // 绑定鼠标事件
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
  layers = [];
});

// 新增：监听鼠标离开事件，可选重置位置
watch(isHover, (newVal) => {
  if (!newVal && props.resetOnLeave) {
    resetLayers();
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
  transition: transform 0.1s ease-out;
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
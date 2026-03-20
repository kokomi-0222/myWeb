<template>
  <!-- 视差横幅容器 -->
  <div class="banner-parallax" ref="bannerRef" :style="{ height: bannerHeight }">
    <!-- 多层背景图层 -->
    <div
      v-for="(layer, index) in layers"
      :key="index"
      class="banner-layer"
      :style="{
        '--speed': layer.speed,
        '--z-index': index + 1,
      }"
    >
      <img :src="layer.imgUrl" :alt="`layer-${index}`" class="layer-img" />
    </div>
    <!-- 自定义内容插槽（可加文字/按钮） -->
    <div class="banner-content">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";

// 1. 定义 props（可外部自定义）
const props = defineProps({
  // 横幅高度（默认B站160px）
  bannerHeight: {
    type: String,
    default: "160px",
  },
  // 图层配置：数组，每项包含 imgUrl（图片地址）、speed（移动速度）
  layers: {
    type: Array,
    default: () => [
      // 示例图层（替换成你的图片地址）
      { imgUrl: new URL('@/assets/images/layer1.png', import.meta.url).href, speed: 0.03 }, // 最远层，最慢
      { imgUrl: new URL('@/assets/images/layer2.png', import.meta.url).href, speed: 0.06 }, // 中间层
      { imgUrl: new URL('@/assets/images/layer3.png', import.meta.url).href, speed: 0.09 }  // 最近层，最快
      
    /*     { imgUrl: "https://picsum.photos/1920/160?random=1", speed: 0.03 },
        { imgUrl: "https://picsum.photos/1920/160?random=2", speed: 0.06 },
        { imgUrl: "https://picsum.photos/1920/160?random=3", speed: 0.09 }, */
      
    ],
  },
  // 最大偏移量（防止偏移过大露空白）
  maxOffset: {
    type: Number,
    default: 20,
  },
});

// 2. 定义响应式变量
const bannerRef = ref(null);
let mouseMoveHandler = null;
let mouseLeaveHandler = null;

// 3. 初始化事件监听
onMounted(() => {
  if (!bannerRef.value) return;

  // 鼠标移动事件
  mouseMoveHandler = (e) => {
    const banner = bannerRef.value;
    const rect = banner.getBoundingClientRect();
    // 计算鼠标相对容器中心的偏移（中心为原点）
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const mouseX = e.clientX - rect.left - centerX;
    const mouseY = e.clientY - rect.top - centerY;

    // 遍历所有图层，设置偏移
    const layers = banner.querySelectorAll(".banner-layer");
    layers.forEach((layer) => {
      const speed = parseFloat(getComputedStyle(layer).getPropertyValue("--speed"));
      // 计算偏移并限制最大范围
      const offsetX = Math.min(
        Math.max(mouseX * speed, -props.maxOffset),
        props.maxOffset
      );
      const offsetY = Math.min(
        Math.max(mouseY * speed, -props.maxOffset),
        props.maxOffset
      );
      // 应用偏移（GPU加速，更流畅）
      layer.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });
  };

  // 鼠标移出复位
  mouseLeaveHandler = () => {
    const layers = bannerRef.value?.querySelectorAll(".banner-layer");
    layers?.forEach((layer) => {
      layer.style.transform = "translate(0, 0)";
    });
  };

  // 绑定事件
  bannerRef.value.addEventListener("mousemove", mouseMoveHandler);
  bannerRef.value.addEventListener("mouseleave", mouseLeaveHandler);
});

// 4. 销毁时移除事件（防止内存泄漏）
onUnmounted(() => {
  if (!bannerRef.value) return;
  bannerRef.value.removeEventListener("mousemove", mouseMoveHandler);
  bannerRef.value.removeEventListener("mouseleave", mouseLeaveHandler);
});
</script>

<style scoped>
/* 核心样式：容器 + 图层 + 内容 */
.banner-parallax {
  position: relative;
  width: 100%;
  overflow: hidden;
  cursor: default;
  background-color: #000; /* 兜底背景色 */
}

.banner-layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 110%; /* 比容器宽10%，留偏移空间 */
  height: 110%;
  z-index: var(--z-index);
  transition: transform 0.3s ease-out; /* 平滑动画 */
}

.layer-img {
  width: 100%;
  height: 100%;
  object-fit: cover; /* 保持比例覆盖容器 */
  user-select: none; /* 禁止选中图片 */
  pointer-events: none; /* 不拦截鼠标事件 */
}

.banner-content {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 99; /* 内容层在最上方 */
  color: #fff;
  font-size: 24px;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.5); /* 文字阴影更清晰 */
}
</style>
